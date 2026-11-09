const { getBatch } = require('./_lib/redis');
const { site, send } = require('./_lib/util');

module.exports = async (req, res) => {
  try {
    const { cfg, remaining } = await getBatch();
    const min = Math.min(...site.boxes);
    const open = !!(cfg && cfg.open);
    const sizes = {};
    site.boxes.forEach((b) => (sizes[b] = open && remaining >= b));
    const soldOut = !open || remaining < min;
    send(res, 200, { soldOut, open, label: cfg ? cfg.label : '', remaining: soldOut ? 0 : remaining, sizes });
  } catch (e) {
    send(res, 503, { error: e.message === 'storage_not_configured' ? 'storage_not_configured' : 'unavailable' });
  }
};
