const PROMOTIONS = ['', 'q', 'r', 'b', 'n'];

function decodeUciMoveHex(hex) {
  if (!/^[0-9a-f]{4}$/iu.test(hex)) {
    throw new Error('Binary Core Pack move must contain exactly two bytes');
  }
  const bytes = Buffer.from(hex, 'hex');
  const encoded = bytes.readUInt16LE(0);
  if (encoded >= 0x8000) {
    throw new Error('Binary Core Pack move uses its reserved bit');
  }
  const from = encoded % 64;
  const to = Math.floor(encoded / 64) % 64;
  if (from === to) {
    throw new Error('Binary Core Pack move must use distinct squares');
  }
  const promotionCode = Math.floor(encoded / 4096) % 8;
  const promotion = PROMOTIONS[promotionCode];
  if (promotion === undefined) {
    throw new Error(`Binary Core Pack move has invalid promotion code ${promotionCode}`);
  }
  return `${squareName(from)}${squareName(to)}${promotion}`;
}

function sideToMoveFromPositionMetadataHex(hex) {
  if (!/^[0-9a-f]{2}$/iu.test(hex)) {
    throw new Error('Binary Core Pack position metadata must contain one byte');
  }
  return Number.parseInt(hex, 16) % 2 === 0 ? 'w' : 'b';
}

function squareName(square) {
  return `${String.fromCharCode(97 + (square % 8))}${Math.floor(square / 8) + 1}`;
}

module.exports = {
  decodeUciMoveHex,
  sideToMoveFromPositionMetadataHex
};
