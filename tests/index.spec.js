/**
 * @jest-environment node
 */

const { handler, twitch } = require('../src')
const nock = require('nock')
const MockDate = require('mockdate')
const stubs = require('./stubs')
const moment = require('moment')

describe('lambda-timestamp', () => {
  beforeEach(() => {
    process.env.CLIENT_ID = 'clientId'
    process.env.ACCESS_TOKEN = 'accessToken'
    process.env.DISCORD_WEBHOOK = 'http://discordWebhook.com'
    process.env.CHANNEL_ID = 'channelID'
    process.env.TOKEN = 'token'
  })

  describe('environment', () => {
    test('no client id', async () => {
      delete process.env.CLIENT_ID
      await expect(handler).rejects.toThrowError('Missing CLIENT_ID')
    })

    test('no access token', async () => {
      delete process.env.ACCESS_TOKEN
      await expect(handler).rejects.toThrowError('Missing ACCESS_TOKEN')
    })

    test('no discord webhook', async () => {
      delete process.env.DISCORD_WEBHOOK
      await expect(handler).rejects.toThrowError('Missing DISCORD_WEBHOOK')
    })

    test('no channel id', async () => {
      delete process.env.CHANNEL_ID
      await expect(handler).rejects.toThrowError('Missing CHANNEL_ID')
    })

    test('no token', async () => {
      delete process.env.TOKEN
      await expect(handler).rejects.toThrowError('Missing TOKEN')
    })
  })

  describe('handler method', () => {
    test('no event object', async () => {
      const actual = await handler()
      expect(actual).toEqual({
        statusCode: 400,
        body: 'Bad Request',
      })
    })

    test('no queryStringParameters', async () => {
      const actual = await handler({})
      expect(actual).toEqual({
        statusCode: 400,
        body: 'Bad Request',
      })
    })

    test('no token queryStringParameter', async () => {
      const actual = await handler({ queryStringParameters: { token: null } })
      expect(actual).toEqual({
        statusCode: 400,
        body: 'Bad Request',
      })
    })

    test('token queryParameter not valid', async () => {
      const actual = await handler({
        queryStringParameters: { token: 'invalid' },
      })
      expect(actual).toEqual({
        statusCode: 401,
        body: 'Unauthorized',
      })
    })

    test('cooldown', async () => {
      nock('https://api.twitch.tv').get('/helix/streams').query(true).reply(500)
      nock('http://discordWebhook.com').post('/').reply(200)

      await handler({ queryStringParameters: { token: 'token' } })
      const actual = await handler({
        queryStringParameters: { token: 'token' },
      })
      expect(actual).toEqual({
        statusCode: 429,
        body: 'Too Many Requests.',
      })
    })

    test('returned content from twitch is sent in webhook post body', async () => {
      MockDate.set(Date.now() + 5000)
      nock('https://api.twitch.tv').get('/helix/streams').query(true).reply(500)
      nock('http://discordWebhook.com')
        .post('/', { content: '**API ERROR** - Unable to get stream data' })
        .reply(200)

      const actual = await handler({
        queryStringParameters: { token: 'token' },
      })
      expect(actual).toEqual({
        statusCode: 200,
        body: '**API ERROR** - Unable to get stream data',
      })
    })
  })

  describe('twitch method', () => {
    test('stream endpoint error', async () => {
      nock('https://api.twitch.tv').get('/helix/streams').query(true).reply(500)
      const actual = await twitch()
      expect(actual).toBe('**API ERROR** - Unable to get stream data')
    })

    test('stream is offline', async () => {
      nock('https://api.twitch.tv')
        .get('/helix/streams')
        .query(true)
        .reply(200, { data: [] })
      const actual = await twitch()
      expect(actual).toBe('The stream is currently OFFLINE')
    })

    test('stream is not of type "live"', async () => {
      nock('https://api.twitch.tv')
        .get('/helix/streams')
        .query(true)
        .reply(200, stubs.rerunStream)
      const actual = await twitch()
      expect(actual).toBe('The stream is not LIVE')
    })

    test('no video data from api', async () => {
      MockDate.set(
        moment(stubs.liveStream.data[0].started_at).valueOf() + 1000 * 60 * 10
      )
      nock('https://api.twitch.tv')
        .get('/helix/streams')
        .query(true)
        .reply(200, stubs.liveStream)
      nock('https://api.twitch.tv')
        .get('/kraken/channels/channelID/videos')
        .query(true)
        .reply(500)

      const actual = await twitch()
      expect(actual).toBe(
        '**Escape From Tarkov** - Unable to get video data - 0h10m0s'
      )
    })

    test('no videos returned in results', async () => {
      MockDate.set(
        moment(stubs.liveStream.data[0].started_at).valueOf() + 1000 * 60 * 10
      )
      nock('https://api.twitch.tv')
        .get('/helix/streams')
        .query(true)
        .reply(200, stubs.liveStream)
      nock('https://api.twitch.tv')
        .get('/kraken/channels/channelID/videos')
        .query(true)
        .reply(200, { videos: [] })

      const actual = await twitch()
      expect(actual).toBe('**Escape From Tarkov** - No videos found - 0h10m0s')
    })

    test('no videos returned with type recording', async () => {
      MockDate.set(
        moment(stubs.liveStream.data[0].started_at).valueOf() + 1000 * 60 * 10
      )
      nock('https://api.twitch.tv')
        .get('/helix/streams')
        .query(true)
        .reply(200, stubs.liveStream)
      nock('https://api.twitch.tv')
        .get('/kraken/channels/channelID/videos')
        .query(true)
        .reply(200, stubs.recordedVideo)

      const actual = await twitch()
      expect(actual).toBe(
        '**Escape From Tarkov** - No LIVE videos found - 0h10m0s'
      )
    })

    test('good results with full headers and query checks', async () => {
      MockDate.set(
        moment(stubs.recordingVideo.videos[0].created_at).valueOf() +
          1000 * 60 * 15
      )
      nock('https://api.twitch.tv', {
        reqheaders: {
          'Client-ID': 'clientId',
          Authorization: 'Bearer accessToken',
        },
      })
        .get('/helix/streams')
        .query({ user_id: 'channelID' })
        .reply(200, stubs.liveStream)
      nock('https://api.twitch.tv', {
        reqheaders: {
          'Client-ID': 'clientId',
          Authorization: 'Oauth accessToken',
          Accept: 'application/vnd.twitchtv.v5+json',
        },
      })
        .get('/kraken/channels/channelID/videos')
        .query({
          broadcast_type: 'archive',
          limit: 1,
        })
        .reply(200, stubs.recordingVideo)

      const actual = await twitch()
      expect(actual).toBe(
        '**Escape From Tarkov** - <https://www.twitch.tv/videos/943013562?t=0h15m0s>'
      )
    })
  })
})
