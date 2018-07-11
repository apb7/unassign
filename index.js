require('dotenv').config()
const createScheduler = require('probot-scheduler')
const Unassign = require('./lib/unassign')

module.exports = async robot => {
  // Visit all repositories to mark and sweep no-response issues
  const scheduler = createScheduler(robot, {
    delay: !process.env.DISABLE_DELAY,
    interval: 60 * 5 * 1000
  });

  // Unmark no response issues if a user comments
  const events = [
    'issue_comment',
    'issues',
  ]

  robot.on(events, unmark)
  robot.on('schedule.repository', markAndSweep)

  async function unmark (context) {
    console.error('ERROR INSIDE UNMARK')
    if (!context.isBot) {
      const unassign = new Unassign(context.github, context.repo({logger: robot.log}))
      let issue = context.payload.issue || context.payload.pull_request
      const type = context.payload.issue ? 'issues' : 'pulls'
      console.log('INSIDE INDEX UNMARK');
      // Some payloads don't include labels
      if (!issue.labels) {
        try {
          issue = (await context.github.issues.get(context.issue())).data
        } catch (error) {
          context.log('Issue not found')
        }
      }

      const noResponseLabelAdded = context.payload.action === 'labeled' &&
        context.payload.label.name === 'issue assignee: no-response'

      if (unassign.hasNoResponseLabel(type, issue) && issue.state !== 'closed' && !noResponseLabelAdded) {
        unassign.unmark(type, issue)
      }
    }
  }

  async function markAndSweep (context) {
    const unassign = new Unassign(context.github, context.repo({logger: robot.log}))
    await unassign.markAndSweep('issues')
  }
}
