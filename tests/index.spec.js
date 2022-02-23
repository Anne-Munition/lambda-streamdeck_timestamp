/**
 * @jest-environment node
 */

const { handler, twitch, getKeys } = require('../src');
const nock = require('nock');
const MockDate = require('mockdate');
const stubs = require('./stubs');
const dayjs = require('dayjs');
const duration = require('dayjs/plugin/duration');

dayjs.extend(duration);

nock('https://test.execute-api.us-east-1.amazonaws.com', {
  reqheaders: {
    'x-api-key': 'awsapikey',
  },
})
  .get('/')
  .reply(200, {
    client_id: 'aws_client_id',
    access_token: 'aws_access_token',
  })
  .persist(true);

describe('lambda-timestamp', () => {
  beforeEach(async () => {
    process.env.DISCORD_WEBHOOK = 'http://discordWebhook.com';
    process.env.CHANNEL_ID = 'channelID';
    process.env.TOKEN = 'token';
    process.env.AWS_URL = 'https://test.execute-api.us-east-1.amazonaws.com';
    process.env.AWS_API_KEY = 'awsapikey';
    await getKeys();
  });

  describe('getKeys', () => {
    it('sets the env with keys from aws', async () => {
      expect(process.env.CLIENT_ID).toBe('aws_client_id');
      expect(process.env.ACCESS_TOKEN).toBe('aws_access_token');
    });
  });

  describe('environment', () => {
    test('no discord webhook', async () => {
      delete process.env.DISCORD_WEBHOOK;
      await expect(handler).rejects.toThrowError('Missing DISCORD_WEBHOOK');
    });

    test('no channel id', async () => {
      delete process.env.CHANNEL_ID;
      await expect(handler).rejects.toThrowError('Missing CHANNEL_ID');
    });

    test('no token', async () => {
      delete process.env.TOKEN;
      await expect(handler).rejects.toThrowError('Missing TOKEN');
    });
  });

  describe('handler method', () => {
    test('no event object', async () => {
      const actual = await handler();
      expect(actual).toEqual({
        statusCode: 400,
        body: 'Bad Request',
      });
    });

    test('no queryStringParameters', async () => {
      const actual = await handler({});
      expect(actual).toEqual({
        statusCode: 400,
        body: 'Bad Request',
      });
    });

    test('no token queryStringParameter', async () => {
      const actual = await handler({ queryStringParameters: { token: null } });
      expect(actual).toEqual({
        statusCode: 400,
        body: 'Bad Request',
      });
    });

    test('token queryParameter not valid', async () => {
      const actual = await handler({
        queryStringParameters: { token: 'invalid' },
      });
      expect(actual).toEqual({
        statusCode: 401,
        body: 'Unauthorized',
      });
    });

    test('cooldown', async () => {
      nock('https://api.twitch.tv')
        .get('/helix/streams')
        .query(true)
        .reply(500);
      nock('http://discordWebhook.com').post('/').reply(200);

      await handler({ queryStringParameters: { token: 'token' } });
      const actual = await handler({
        queryStringParameters: { token: 'token' },
      });
      expect(actual).toEqual({
        statusCode: 429,
        body: 'Too Many Requests.',
      });
    });

    test('returned content from twitch is sent in webhook post body', async () => {
      MockDate.set(Date.now() + 5000);
      nock('https://api.twitch.tv')
        .get('/helix/streams')
        .query(true)
        .reply(500);
      nock('http://discordWebhook.com')
        .post('/', { content: '**API ERROR** - Unable to get stream data' })
        .reply(200);

      const actual = await handler({
        queryStringParameters: { token: 'token' },
      });
      expect(actual).toEqual({
        statusCode: 200,
        body: '**API ERROR** - Unable to get stream data',
      });
    });
  });

  describe('twitch method', () => {
    test('stream endpoint error', async () => {
      nock('https://api.twitch.tv')
        .get('/helix/streams')
        .query(true)
        .reply(500);
      const actual = await twitch();
      expect(actual).toBe('**API ERROR** - Unable to get stream data');
    });

    test('stream is offline', async () => {
      nock('https://api.twitch.tv')
        .get('/helix/streams')
        .query(true)
        .reply(200, { data: [] });
      const actual = await twitch();
      expect(actual).toBe('The stream is currently OFFLINE');
    });

    test('stream is not of type "live"', async () => {
      nock('https://api.twitch.tv')
        .get('/helix/streams')
        .query(true)
        .reply(200, stubs.rerunStream);
      const actual = await twitch();
      expect(actual).toBe('The stream is not LIVE');
    });

    test('no video data from api', async () => {
      MockDate.set(
        dayjs(stubs.liveStream.data[0].started_at).valueOf() + 1000 * 60 * 10,
      );
      nock('https://api.twitch.tv')
        .get('/helix/streams')
        .query(true)
        .reply(200, stubs.liveStream);
      nock('https://api.twitch.tv')
        .get('/kraken/channels/channelID/videos')
        .query(true)
        .reply(500);

      const actual = await twitch();
      expect(actual).toBe(
        '**Escape From Tarkov** - Unable to get video data - 0h10m0s',
      );
    });

    test('no videos returned in results', async () => {
      MockDate.set(
        dayjs(stubs.liveStream.data[0].started_at).valueOf() + 1000 * 60 * 10,
      );
      nock('https://api.twitch.tv')
        .get('/helix/streams')
        .query(true)
        .reply(200, stubs.liveStream);
      nock('https://api.twitch.tv')
        .get('/helix/videos')
        .query(true)
        .reply(200, { data: [] });

      const actual = await twitch();
      expect(actual).toBe('**Escape From Tarkov** - No videos found - 0h10m0s');
    });

    test('good results with full headers and query checks', async () => {
      MockDate.set(
        dayjs(stubs.video.data[0].created_at).valueOf() + 1000 * 60 * 15,
      );
      nock('https://api.twitch.tv', {
        reqheaders: {
          'Client-ID': 'aws_client_id',
          Authorization: 'Bearer aws_access_token',
        },
      })
        .get('/helix/streams')
        .query({ user_id: 'channelID' })
        .reply(200, stubs.liveStream);
      nock('https://api.twitch.tv', {
        reqheaders: {
          'Client-ID': 'aws_client_id',
          Authorization: 'Bearer aws_access_token',
        },
      })
        .get('/helix/videos')
        .query({
          user_id: 'channelID',
          type: 'archive',
          first: 1,
        })
        .reply(200, stubs.video);

      const actual = await twitch();
      expect(actual).toBe(
        '**Escape From Tarkov** - <https://www.twitch.tv/videos/1306542392?t=0h15m0s>',
      );
    });
  });
});
