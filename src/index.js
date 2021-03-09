const axios = require('axios')
const moment = require('moment')

function helixHeaders() {
  return {
    'Client-ID': process.env.CLIENT_ID,
    Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
  }
}

function krakenHeaders() {
  return {
    'Client-ID': process.env.CLIENT_ID,
    Authorization: `Oauth ${process.env.ACCESS_TOKEN}`,
    Accept: 'application/vnd.twitchtv.v5+json',
  }
}

async function twitch() {
  const now = moment()
  const streamData = await axios
    .get('https://api.twitch.tv/helix/streams', {
      params: { user_id: process.env.CHANNEL_ID },
      headers: helixHeaders(),
    })
    .then(({ data }) => data)
    .catch(() => null)
  if (!streamData) return '**API ERROR** - Unable to get stream data'
  if (!streamData.data.length) return 'The stream is currently OFFLINE'
  const stream = streamData.data[0]
  if (stream.type !== 'live') return 'The stream is not LIVE'
  const game = stream.game_name
  const videoData = await axios
    .get(
      `https://api.twitch.tv/kraken/channels/${process.env.CHANNEL_ID}/videos`,
      {
        params: {
          broadcast_type: 'archive',
          limit: 1,
        },
        headers: krakenHeaders(),
      }
    )
    .then(({ data }) => data)
    .catch(() => null)
  const streamDuration = moment.duration(now - moment(stream.started_at))
  const streamTimestamp = `${streamDuration.hours()}h${streamDuration.minutes()}m${streamDuration.seconds()}s`
  if (!videoData)
    return `**${game}** - Unable to get video data - ${streamTimestamp}`
  if (!videoData.videos.length)
    return `**${game}** - No videos found - ${streamTimestamp}`
  const video = videoData.videos[0]
  if (video.status !== 'recording')
    return `**${game}** - No LIVE videos found - ${streamTimestamp}`
  const videoDuration = moment.duration(now - moment(video.created_at))
  const videoTimestamp = `${videoDuration.hours()}h${videoDuration.minutes()}m${videoDuration.seconds()}s`
  return `**${game}** - <${video.url}?t=${videoTimestamp}>`
}

let lastRun

async function handler(event) {
  if (!process.env.CLIENT_ID) throw new Error('Missing CLIENT_ID')
  if (!process.env.ACCESS_TOKEN) throw new Error('Missing ACCESS_TOKEN')
  if (!process.env.DISCORD_WEBHOOK) throw new Error('Missing DISCORD_WEBHOOK')
  if (!process.env.CHANNEL_ID) throw new Error('Missing CHANNEL_ID')
  if (!process.env.TOKEN) throw new Error('Missing TOKEN')

  if (
    !event ||
    !event.queryStringParameters ||
    !event.queryStringParameters.token
  )
    return {
      statusCode: 400,
      body: 'Bad Request',
    }

  if (event.queryStringParameters.token !== process.env.TOKEN)
    return {
      statusCode: 401,
      body: 'Unauthorized',
    }

  if (lastRun) {
    const diff = Math.floor((Date.now() - lastRun) / 1000)
    if (diff < 5) {
      return {
        statusCode: 429,
        body: 'Too Many Requests.',
      }
    }
  }
  lastRun = Date.now()

  const content = await twitch()
  if (!content) return
  await axios.post(process.env.DISCORD_WEBHOOK, {
    content,
  })

  return {
    statusCode: 200,
    body: content,
  }
}

module.exports = {
  handler,
  twitch,
}
