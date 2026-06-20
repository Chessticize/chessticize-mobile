const detox = require('detox');
const config = require('../.detoxrc');

beforeAll(async () => {
  await detox.init(config, { launchApp: false });
});

beforeEach(async () => {
  await device.launchApp({ newInstance: true });
});

afterAll(async () => {
  await detox.cleanup();
});
