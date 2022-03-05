const axios = require('axios');
const dayjs = require('dayjs');
const duration = require('dayjs/plugin/duration');

dayjs.extend(duration);

function helixHeaders() {
  return {
    'Client-ID': process.env.CLIENT_ID,
    Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
  };
}

async function twitch() {
  const now = dayjs();
  const streamData = await axios
    .get('https://api.twitch.tv/helix/streams', {
      params: { user_id: process.env.CHANNEL_ID },
      headers: helixHeaders(),
    })
    .then(({ data }) => data.data)
    .catch(() => null);
  if (!streamData) return '**API ERROR** - Unable to get stream data';
  if (!streamData.length) return 'The stream is currently OFFLINE';
  const stream = streamData[0];
  if (stream.type !== 'live') return 'The stream is not LIVE';
  const game = stream.game_name;
  const videoData = await axios
    .get('https://api.twitch.tv/helix/videos', {
      params: {
        user_id: process.env.CHANNEL_ID,
        type: 'archive',
        first: 1,
      },
      headers: helixHeaders(),
    })
    .then(({ data }) => data.data)
    .catch(() => null);
  const streamDuration = dayjs.duration(now - dayjs(stream.started_at));
  const streamTimestamp = `${streamDuration.hours()}h${streamDuration.minutes()}m${streamDuration.seconds()}s`;
  if (!videoData)
    return `**${game}** - Unable to get video data - ${streamTimestamp}`;
  if (!videoData.length)
    return `**${game}** - No videos found - ${streamTimestamp}`;
  const video = videoData[0];
  const videoDuration = dayjs.duration(now - dayjs(video.created_at));
  const videoTimestamp = `${videoDuration.hours()}h${videoDuration.minutes()}m${videoDuration.seconds()}s`;
  return `**${game}** - <${video.url}?t=${videoTimestamp}>`;
}

let lastRun;

async function handler(event) {
  if (!process.env.DISCORD_WEBHOOK) throw new Error('Missing DISCORD_WEBHOOK');
  if (!process.env.CHANNEL_ID) throw new Error('Missing CHANNEL_ID');
  if (!process.env.TOKEN) throw new Error('Missing TOKEN');

  if (
    !event ||
    !event.queryStringParameters ||
    !event.queryStringParameters.token
  )
    return {
      statusCode: 400,
      body: 'Bad Request',
    };

  if (event.queryStringParameters.token !== process.env.TOKEN)
    return {
      statusCode: 401,
      body: 'Unauthorized',
    };

  if (lastRun) {
    const diff = Math.floor((Date.now() - lastRun) / 1000);
    if (diff < 5) {
      return {
        statusCode: 429,
        body: 'Too Many Requests.',
      };
    }
  }
  lastRun = Date.now();

  try {
    await getKeys();
    const content = await twitch();
    if (!content) return;
    await axios.post(process.env.DISCORD_WEBHOOK, {
      content,
    });
    return {
      statusCode: 200,
      body: content,
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error' }),
    };
  }
}

async function getKeys() {
  const keys = await axios
    .get(process.env.AWS_URL, {
      headers: {
        'x-api-key': process.env.AWS_API_KEY,
      },
    })
    .then(({ data }) => data);
  process.env.CLIENT_ID = keys.client_id;
  process.env.ACCESS_TOKEN = keys.access_token;
}

module.exports = {
  handler,
  twitch,
  getKeys,
};
