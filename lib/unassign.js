const maxActionsPerRun = 30

module.exports = class Unassign {
  constructor (github, {owner, repo, logger = console}) {
    this.github = github
    this.owner = owner
    this.repo = repo
    this.logger = logger
    this.remainingActions = 0

    Object.assign({owner, repo})
  }

  async markAndSweep (type) {
    this.logger.info(`starting mark and sweep of ${type}`)
    const limitPerRun = maxActionsPerRun
    const owner = this.owner
    const repo = this.repo
    var daysUntilUnassign = process.env.DAYS_UNTIL_UNASSIGN
    this.remainingActions = Math.min(limitPerRun, maxActionsPerRun)
    await this.ensureNoResponseLabelExists(type)

    this.getNoResponseLabel(type).then(res => {
      res.filter(issue => !issue.locked)
        .forEach(issue => this.mark(type, issue))
    })

    if (daysUntilUnassign) {
      this.logger.trace({owner, repo}, 'Configured to unassign no-response issues')
      this.getUnassign(type).then(res => {
        res.filter(issue => !issue.locked)
          .forEach(issue => this.unassign(type, issue))
      })
    } else {
      this.logger.trace({owner, repo}, 'Configured to leave no-response issues assigned')
    }
  }

  async getNoResponseLabel (type) {
    const noResponseLabel = 'issue assignee: no-response'
    // Number of days of inactivity after which no-response label is added.
    const owner = this.owner
    const repo = this.repo
    var days = process.env.DAYS_UNTIL_NO_RESPONSE
    const timestamp = this.since(days).toISOString().replace(/\.\d{3}\w$/, '') + 'Z'

    function isInactive(issue) {
      var updatedAt = new Date(issue.updated_at)
      var inactivityTime = new Date(timestamp)
      if(updatedAt <= inactivityTime) {
        return true
      } else {
          return false 
      }
    }

    this.logger.info('searching %s/%s for no-response issues', owner, repo)
    const params = {owner, repo, state:'open', assignee:'*', sort:'updated', direction:'asc', per_page:maxActionsPerRun}
    const searchResults = await this.github.issues.getForRepo(params)
    const filteredSearchResults = searchResults.data.filter(isInactive)
    return filteredSearchResults
  }

  async getUnassign (type) {
    const noResponseLabel = 'issue assignee: no-response'
    const owner = this.owner
    const repo = this.repo
    var days = process.env.DAYS_UNTIL_UNASSIGN
    const timestamp = this.since(days).toISOString().replace(/\.\d{3}\w$/, '') + 'Z'

    function isReallyInactive(issue) {
      var updatedAt = new Date(issue.updated_at)
      var reallyInactivityTime = new Date(timestamp)
      if(updatedAt <= reallyInactivityTime) {
        return true
      } else {
        return false
      }
    }

    this.logger.info('searching %s/%s for no-response labelled issues', owner, repo)
    const params = {owner, repo, state:'open', assignee:'*', labels:[noResponseLabel], sort:'updated', direction:'asc', per_page:maxActionsPerRun}
    const searchResults = await this.github.issues.getForRepo(params)
    const filteredSearchResults = searchResults.data.filter(isReallyInactive)
    return filteredSearchResults
  }

  async mark (type, issue) {
    const issueAssignee = await issue.assignee
    const isPullRequest = await issue.pull_request !== undefined ? true : false

    // Return if there are no remaining actions or there is no assignee for the issue
    // or it is a pull request or the issue already has a noResponseLabel.
    if (this.remainingActions === 0 || issueAssignee === null || isPullRequest || this.hasNoResponseLabel(type, issue)) {
      return
    }

    this.remainingActions--
    const owner = this.owner
    const repo = this.repo
    const noResponseLabel = 'issue assignee: no-response'
    const number = issue.number
    var perform = process.env.PERFORM
    var markComment = 'Hi @assignee, this issue has been automatically marked for no response from your end. ' + 
      'You will be unassigned from this issue if no further activity takes place.' // Change message later on.
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
    const noResponseLabel = 'issue assignee: no-response'
    const unassignComment = false
    const number = issue.number
    var perform = process.env.PERFORM

    if (perform) {
      this.logger.info('%s/%s#%d is being unassigned', owner, repo, number)
      if (unassignComment) {
        await this.github.issues.createComment({owner, repo, number, body: unassignComment})
      }
      await this.github.issues.removeLabel({owner, repo, number, name: noResponseLabel})
      return this.github.issues.edit({owner, repo, number, assignees: []})
    } else {
      this.logger.info('%s/%s#%d would have been unassigned (dry-run)', owner, repo, number)
    }
  }

  async unmark (type, issue) {
    const owner = this.owner
    const repo = this.repo
    const noResponseLabel = 'issue assignee: no-response'
    const unmarkComment = false
    const number = issue.number
    var perform = process.env.PERFORM

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
    const ttl = Number(days) * 24 * 60 * 60 * 1000
    let date = new Date(new Date() - ttl)

    // GitHub won't allow it
    if (date < new Date(0)) {
      date = new Date(0)
    }
    return date
  }
}
