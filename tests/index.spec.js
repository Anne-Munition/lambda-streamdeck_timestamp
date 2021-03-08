/**
 * @jest-environment node
 */

const index = require('../src')
const nock = require('nock')
const MockDate = require('mockdate')
const stubs = require('./stubs')

const run = index.handler

jest.spyOn(console, 'log').mockImplementation(() => {})

describe('index', () => {
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
      await expect(run).rejects.toThrowError('Missing CLIENT_ID')
    })

    test('no access token', async () => {
      delete process.env.ACCESS_TOKEN
      await expect(run).rejects.toThrowError('Missing ACCESS_TOKEN')
    })

    test('no discord webhook', async () => {
      delete process.env.DISCORD_WEBHOOK
      await expect(run).rejects.toThrowError('Missing DISCORD_WEBHOOK')
    })

    test('no channel id', async () => {
      delete process.env.CHANNEL_ID
      await expect(run).rejects.toThrowError('Missing CHANNEL_ID')
    })

    test('no token', async () => {
      delete process.env.TOKEN
      await expect(run).rejects.toThrowError('Missing TOKEN')
    })
  })

  describe('query parameters', () => {
    test('no event', async () => {
      const actual = await run()
      expect(actual).toEqual({
        statusCode: 400,
        body: 'Bad Request',
      })
    })

    test('no queryStringParameters', async () => {
      const actual = await run({})
      expect(actual).toEqual({
        statusCode: 400,
        body: 'Bad Request',
      })
    })

    test('no token queryStringParameter', async () => {
      const actual = await run({ queryStringParameters: { token: null } })
      expect(actual).toEqual({
        statusCode: 400,
        body: 'Bad Request',
      })
    })

    test('token queryParameter not valid', async () => {
      const actual = await run({ queryStringParameters: { token: 'invalid' } })
      expect(actual).toEqual({
        statusCode: 401,
        message: 'Unauthorized',
      })
    })
  })

  test('cooldown', async () => {
    nock('https://api.twitch.tv').get('/helix/streams').query(true).reply(500)

    await run({
      queryStringParameters: { token: 'token' },
      isTest: true,
    })
    const actual = await run({
      queryStringParameters: { token: 'token' },
      isTest: true,
    })
    expect(actual).toEqual({
      statusCode: 429,
      body: 'Too Many Requests.',
    })
  })

  describe('runs at 6 seconds apart', () => {
    beforeEach(() => {
      MockDate.set(Date.now() + 6000)
    })

    test('stream endpoint error', async () => {
      nock('https://api.twitch.tv').get('/helix/streams').query(true).reply(500)
      const actual = await run({
        queryStringParameters: { token: 'token' },
        isTest: true,
      })
      expect(actual).toEqual({
        statusCode: 200,
        body: '**API ERROR** - Unable to get stream data',
      })
    })

    test('stream is offline', async () => {
      nock('https://api.twitch.tv')
        .get('/helix/streams')
        .query(true)
        .reply(200, { data: [] })
      const actual = await run({
        queryStringParameters: { token: 'token' },
        isTest: true,
      })
      expect(actual).toEqual({
        statusCode: 200,
        body: 'The stream is currently OFFLINE',
      })
    })

    test('stream is not of type "live"', async () => {
      nock('https://api.twitch.tv')
        .get('/helix/streams')
        .query(true)
        .reply(200, stubs.replayStream)
      const actual = await run({
        queryStringParameters: { token: 'token' },
        isTest: true,
      })
      expect(actual).toEqual({
        statusCode: 200,
        body: 'The stream is not LIVE',
      })
    })
  })
})
