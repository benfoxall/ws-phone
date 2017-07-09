require('dotenv-safe').load()

const server = require('http').createServer()
const WebSocketServer = require('ws').Server
const express = require('express')
const bodyParser = require('body-parser')
const app = express()
const wss = new WebSocketServer({ server: server })

// Inbound number for display
const inbound_number = process.env.INBOUND_NUMBER || '-'



const Nexmo = require('nexmo')

const privateKey = Buffer.from(process.env.PRIVATE_KEY)

const nexmo = new Nexmo({
  apiKey:        process.env.KEY,
  apiSecret:     process.env.SECRET,
  applicationId: process.env.APP_ID,
  privateKey:    privateKey
})



app.use(express.static('static'))
app.enable('trust proxy')

app.get('/answer', (req, res) => {

  const input_url =
    (req.secure ? 'https' : 'http') + '://' +
    req.headers.host + '/input'

  res.send([
    {
      action: 'talk',
      text: 'Enter that code on your screen now'
    },
    {
      action: 'input',
      eventUrl: [input_url],
      timeOut: 10,
      maxDigits: 4
    }
  ])

})


app.get('/connect/:PIN', bodyParser.json(), (req, res) => {

  const PIN = req.params.PIN

  if(!pins.has(PIN))
    return res.send([
      {
        action: 'talk',
        text: 'Couldn\'t find a matching call, sorry'
      }
    ])

  const ws_url =
    (req.secure ? 'wss' : 'ws') + '://' +
    req.headers.host + '/server/' + PIN

  res.send([
    {
      action: 'talk',
      text: 'hang on'
    },
    {
      'action': 'connect',
      'endpoint': [
        {
          'type': 'websocket',
          'uri': ws_url,
          'content-type': 'audio/l16;rate=16000',
          'headers': {}
        }
      ]
    }
  ])

})



app.post('/event', bodyParser.json(), (req, res) => {
  console.log('event>', req.body)
  res.sendStatus(200)
})


app.post('/input', bodyParser.json(), (req, res) => {

  console.log(`connecting ${req.body.uuid} to ${req.body.dtmf}`)

  const ws_url =
    (req.secure ? 'wss' : 'ws') + '://' +
    req.headers.host + '/server/' + req.body.dtmf


  if(pins.has(req.body.dtmf)) {
    res.send([
      {
        action: 'talk',
        text: 'connecting you'
      },
      {
        'action': 'connect',
        'endpoint': [
          {
            'type': 'websocket',
            'uri': ws_url,
            'content-type': 'audio/l16;rate=16000',
            'headers': {}
          }
        ]
      }
    ])
  } else {

    res.send([
      {
        action: 'talk',
        text: 'Couldn\'t find a matching call, sorry'
      }
    ])

  }

})

// keep track of who is talking to who
const connections = new Map
const pins = new Map

const generatePIN = () => {
  for (var i = 0; i < 3; i++) {
    const attempt = Math.random().toString().substr(2,4)

    if(!pins.has(attempt)) return attempt
  }
  return 'nope'
}


wss.on('connection', ws => {

  const url = ws.upgradeReq.url

  const serverRE = /^\/server\/(\d{4})$/

  let pin, _outbound


  if(url == '/outbound') {

    // could be more secure, since no-one is typing in
    pin = generatePIN()

    pins.set(pin, ws)

    ws.on('close', () => {
      pins.delete(pin)
    })

    console.log('OUTBOUND LISTENER ', pin)

    _outbound = true

  } else

  if(url == '/browser') {

    pin = generatePIN()

    ws.send(JSON.stringify({ pin, inbound_number }))

    pins.set(pin, ws)

    ws.on('close', () => {
      pins.delete(pin)
    })

  } else

  if(url.match(serverRE)) {

    const digits = url.match(serverRE)[1]

    const client = pins.get(digits)
    if(client) {
      console.log('found client!!')
      connections.set(ws, client)
      connections.set(client, ws)
    }

  }



  ws.on('message', data => {
    const other = connections.get(ws)

    if(other && other.readyState == ws.OPEN) {
      other.send(data)

      console.log('proxy: ', ws.upgradeReq.url, '  ---->  ', other.upgradeReq.url)
    }

    // perhaps the client was trying to place a call
    // This could be called serveral times (is that a problem?)
    else if(_outbound && (typeof data == 'string')) {
      try {
        const config = JSON.parse(data)
        console.log('attempting outbound: ', config)
        place_outbound(config, pin)
      } catch (e) {
        console.error(e)
      }
    }

  })

  ws.on('close', () => {
    console.log('closing')
    connections.delete(ws)
  })


})


server.on('request', app)

server.listen(process.env.PORT || 3000, () => {
  console.log('Listening on ' + server.address().port)
})

function place_outbound(config, pin) {

  const answer_url = process.env.PUBLIC_URL + '/connect/' + pin

  const {name, token} = config

  const number = process.env[`OUTBOUND_${name}`]
  const secret = process.env[`OUTBOUND_${name}_TOKEN`]

  if(!number)
    return console.log(`Failed: number not found for ${name}`)

  if(secret && (secret !== token))
    return console.log(`Failed: token doesn't match for ${name}`)


  console.log(`Placing call to ${name} (${number})`)

  nexmo.calls.create({
    to: [{
      type: 'phone',
      number: number
    }],
    from: {
      type: 'phone',
      number: process.env.NUMBER
    },
    answer_url: [answer_url]
  }, (err) => {
    if(err) console.error(err)
    else console.log('Placed call')
  })
}
