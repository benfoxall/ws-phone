require('dotenv-safe').load()

const Nexmo = require('nexmo')

const privateKey = Buffer.from(process.env.PRIVATE_KEY)

const nexmo = new Nexmo({
  apiKey:        process.env.KEY,
  apiSecret:     process.env.SECRET,
  applicationId: process.env.APP_ID,
  privateKey:    privateKey
})

const answer_url = process.env.PUBLIC_URL + '/answer'
const event_url = process.env.PUBLIC_URL + '/event'

console.log(`Updating endpoints:
 app:        ${process.env.APP_ID}
 answer url: ${answer_url}
 event url:  ${event_url}
`)

console.log('Setting app answer/event urls...')
nexmo.applications
  .update(
    process.env.APP_ID,
    `ws-phone-local (auto - ${process.env.PUBLIC_URL})`,
    'voice',
    answer_url, event_url,
    {},
    (err) => {
      if(err) return console.error(err)
      console.log('...Done')
    })
