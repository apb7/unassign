const maxActionsPerRun = 30

module.exports = class Unassign {
  constructor (github, {owner, repo, assignees = [], logger = console}) {
    this.github = github
    this.owner = owner
    this.repo = repo
    this.assignees = assignees
    this.logger = logger
    this.remainingActions = 0

    Object.assign({owner, repo})
  }

  async markAndSweep (type) {
    this.logger.info(`starting mark and sweep of ${type}`)
    this.logger.info('ALL ASSIGNEES', this.assignees)
    const limitPerRun = maxActionsPerRun
    this.remainingActions = Math.min(limitPerRun, maxActionsPerRun)

    await this.ensureNoResponseLabelExists(type)

    this.getNoResponseLabel(type).then(res => {
      res.data.items.filter(issue => !issue.locked)
        .forEach(issue => this.mark(type, issue))
    })

    const owner = this.owner
    const repo = this.repo
    // Number of days after which the issue is unassigned post the no-response labeling.
    const daysUntilUnassign = process.env.DAYS_UNTIL_UNASSIGN

    if (daysUntilUnassign) {
      this.logger.trace({owner, repo}, 'Configured to unassign no-response issues')
      this.getUnassign(type).then(res => {
        res.data.items.filter(issue => !issue.locked)
          .forEach(issue => this.unassign(type, issue))
      })
    } else {
      this.logger.trace({owner, repo}, 'Configured to leave no-response issues assigned')
    }
  }

  getNoResponseLabel (type) {
    const noResponseLabel = 'issue assignee: no-response'
    const exemptLabels = ''
    const exemptProjects = ''
    const exemptMilestones = ''
    const labels = [noResponseLabel].concat(exemptLabels)
    const queryParts = labels.map(label => `-label:"${label}"`)
    queryParts.push(Unassign.getQueryTypeRestriction(type))

    queryParts.push(exemptProjects ? 'no:project' : '')
    queryParts.push(exemptMilestones ? 'no:milestone' : '')

    const query = queryParts.join(' ')
    // Number of days of inactivity after which no-response label is added.
    const days = process.env.DAYS_UNTIL_NO_RESPONSE
    return this.search(type, days, query)
  }

  getUnassign (type) {
    const noResponseLabel = 'issue assignee: no-response'
    const queryTypeRestriction = Unassign.getQueryTypeRestriction(type)
    const query = `label:"${noResponseLabel}" ${queryTypeRestriction}`
    const days = process.env.DAYS_UNTIL_UNASSIGN
    return this.search(type, days, query)
  }

  static getQueryTypeRestriction (type) {
    if (type === 'pulls') {
      return 'is:pr'
    } else if (type === 'issues') {
      return 'is:issue'
    }
    throw new Error(`Unknown type: ${type}. Valid types are 'pulls' and 'issues'`)
  }

  async search (type, days, query) {
    const owner = this.owner
    const repo = this.repo
    const timestamp = this.since(days).toISOString().replace(/\.\d{3}\w$/, '')

    // This query does not work since we cannot search for assigned issues globally.
    // The only query that works is that for a particular repo.
    // Ex. is:open updated:<${timestamp} ${query} assignee:*
    // would work.
    query = `repo:${owner}/${repo} is:open updated:<${timestamp} ${query} assignee:apb7`
    this.logger.info('QUERY', query)

    const params = {q: query, sort: 'updated', order: 'desc', per_page: maxActionsPerRun}

    this.logger.info(params, 'searching %s/%s for no-response issues', owner, repo)
    const searchResults = await this.github.search.issues(params)
    this.logger.info('SEARCH RESULTS', searchResults)
    return searchResults
  }

  async mark (type, issue) {
    issueAssignee = await issue.assignee.data
    if (this.remainingActions === 0 || issueAssignee === {}) {
      return
    }
    this.remainingActions--
    this.logger.info('ASSIGNEE', issueAssignee)
    const owner = this.owner
    const repo = this.repo
    const perform = process.env.PERFORM
    const noResponseLabel = 'issue assignee: no-response'
    var markComment = 'Hi @assignee, this issue has been marked for no response.' // Change message later on.
    const number = issue.number
    var customMarkComment = markComment.replace('@assignee', '@' + issueAssignee.login)
    if (perform) {
      this.logger.info('%s/%s#%d is being marked', owner, repo, number)
      if (markComment) {
        await this.github.issues.createComment({owner, repo, number, body: customMarkComment})
      }
      return this.github.issues.addLabels({owner, repo, number, labels: [noResponseLabel]})
    } else {
      this.logger.info('%s/%s#%d would have been marked (dry-run)', owner, repo, number)
    }
  }

  async unassign (type, issue) {
    if (this.remainingActions === 0) {
      return
    }
    this.remainingActions--

    const owner = this.owner
    const repo = this.repo
    const perform = process.env.PERFORM
    const unassignComment = false
    const number = issue.number

    if (perform) {
      this.logger.info('%s/%s#%d is being unassigned', owner, repo, number)
      if (unassignComment) {
        await this.github.issues.createComment({owner, repo, number, body: unassignComment})
      }
      return this.github.issues.edit({owner, repo, number, assignees: []})
    } else {
      this.logger.info('%s/%s#%d would have been unassigned (dry-run)', owner, repo, number)
    }
  }

  async unmark (type, issue) {
    const owner = this.owner
    const repo = this.repo
    const perform = process.env.PERFORM
    const noResponseLabel = 'issue assignee: no-response'
    const unmarkComment = false
    const number = issue.number

    if (perform) {
      this.logger.info('%s/%s#%d is being unmarked', owner, repo, number)

      if (unmarkComment) {
        await this.github.issues.createComment({owner, repo, number, body: unmarkComment})
      }

      return this.github.issues.removeLabel({owner, repo, number, name: noResponseLabel}).catch((err) => {
        // ignore if it's a 404 because then the label was already removed
        if (err.code !== 404) {
          throw err
        }
      })
    } else {
      this.logger.info('%s/%s#%d would have been unmarked (dry-run)', owner, repo, number)
    }
  }

  // Returns true if at least one exempt label is present.
  hasExemptLabel (type, issue) {
    const exemptLabels = ''
    return issue.labels.some(label => exemptLabels.includes(label.name))
  }

  hasNoResponseLabel (type, issue) {
    const noResponseLabel = 'issue assignee: no-response'
    return issue.labels.map(label => label.name).includes(noResponseLabel)
  }

  async ensureNoResponseLabelExists (type) {
    const owner = this.owner
    const repo = this.repo
    const noResponseLabel = 'issue assignee: no-response'

    return this.github.issues.getLabel({owner, repo, name: noResponseLabel}).catch(() => {
      return this.github.issues.createLabel({owner, repo, name: noResponseLabel, color: 'ffffff'})
    })
  }

  since (days) {
    const ttl = days * 24 * 60 * 60 * 1000
    let date = new Date(new Date() - ttl)

    // GitHub won't allow it
    if (date < new Date(0)) {
      date = new Date(0)
    }
    return date
  }
}
