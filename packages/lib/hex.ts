// See https://github.com/robinmoisson/staticrypt/blob/f7266b074054d2e02a942c15de2aa1df0d8f12c1/lib/cryptoEngine.js#L12

export function hexStringToBytes(hexString: string) {
  if (hexString.length % 2 !== 0) throw "Invalid hexString";
  const arrayBuffer = new Uint8Array(hexString.length / 2);

  for (let i = 0; i < hexString.length; i += 2) {
    const byteValue = parseInt(hexString.substring(i, i + 2), 16);
    if (isNaN(byteValue)) {
      throw "Invalid hexString";
    }
    arrayBuffer[i / 2] = byteValue;
  }
  return arrayBuffer;
}

export function bytesToHexString(bytes: Uint8Array) {
  const hexBytes = [];

  for (let i = 0; i < bytes.length; ++i) {
    let byteString = bytes[i]!.toString(16);
    if (byteString.length < 2) {
      byteString = "0" + byteString;
    }
    hexBytes.push(byteString);
  }
  return hexBytes.join("");
}
