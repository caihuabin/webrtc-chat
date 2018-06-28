const Koa = require('koa')
const WebSocket = require('ws')
const serve = require('koa-static')
const path = require('path')
const http = require('http')
const koaBody = require('koa-body')

const app = new Koa()
let wss = null
const chats = []
app.use(serve(path.join(__dirname, './static/'), {
  // maxage: 30 * 24 * 3600 * 1000,
  maxage: 0
}))
app.use(koaBody())
app.use(async (ctx, next) => {
  if (/^\/chats\/?$/.test(ctx.path)) {
    const chat = {
      callerIp: ctx.ip,
      answerIp: null
    }
    chats.push(chat)
    ctx.body = JSON.stringify({ callerIp: chat.callerIp, answerIp: chat.answerIp })
  } else {
    const exec = /^\/chats\/(.+)$/.exec(ctx.path)
    if (exec) {
      const callerIp = exec[1]
      const chat = chats.find((item) => { return item.callerIp === callerIp })
      chat.answerIp = ctx.ip
      ctx.body = JSON.stringify({ callerIp: chat.callerIp, answerIp: chat.answerIp })
    }
  }
  wss.broadcast(JSON.stringify({ type: 'chats', chats: chats.map(item => ({ callerIp: item.callerIp, answerIp: item.answerIp })) }))
  await next()
})
const server = http.createServer(app.callback())
wss = new WebSocket.Server({ server })

wss.broadcast = function broadcast(data) {
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data)
    }
  })
}

wss.on('connection', function connection(ws, req) {
  ws.send(JSON.stringify({ type: 'chats', chats: chats.map(item => ({ callerIp: item.callerIp, answerIp: item.answerIp })) }))
  ws.on('message', function incoming(message) {
    const json = JSON.parse(message)
    const chat = chats.find((item) => { return item.callerIp === req.client.remoteAddress || item.answerIp === req.client.remoteAddress })

    if (json.type === 'ok') {
      if (chat.callerIp === req.client.remoteAddress) {
        chat.callerWs = ws
      } else if (chat.answerIp === req.client.remoteAddress){
        chat.answerWs = ws
      }
      if (chat.callerWs && chat.answerWs && chat.answerWs.readyState === WebSocket.OPEN && chat.callerWs.readyState === WebSocket.OPEN) {
        chat.callerWs.send(JSON.stringify({ type: 'ok' }))
        chat.answerWs.send(JSON.stringify({ type: 'ok' }))
      }
    } else {
      if (chat.callerIp === req.client.remoteAddress) {
        chat.answerWs.send(message)
      } else if (chat.answerIp === req.client.remoteAddress){
        chat.callerWs.send(message)
      }
    }
  })
  ws.on('close', () => {
    const index = chats.findIndex((item) => { return item.callerIp === req.client.remoteAddress || item.answerIp === req.client.remoteAddress })
    if (index === -1) {
      return
    }
    const chat = chats.splice(index, 1)[0]
    if (chat.callerIp === req.client.remoteAddress) {
      chat.answerWs && chat.answerWs.send(JSON.stringify({ type: 'close' }))
    } else if (chat.answerIp === req.client.remoteAddress){
      chat.callerWs && chat.callerWs.send(JSON.stringify({ type: 'close' }))
    }
    wss.broadcast(JSON.stringify({ type: 'chats', chats: chats.map(item => ({ callerIp: item.callerIp, answerIp: item.answerIp })) }))
  })
})

server.listen(3000, function listening() {
  console.log('Listening on %d', server.address().port)
})