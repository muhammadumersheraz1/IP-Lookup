import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function findEocd(buf) {
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("ZIP end-of-central-directory not found");
}

export default function unzipBin(zipPath, destBin) {
  const buf = fs.readFileSync(zipPath);
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  let chosen = null;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory");
    }
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.subarray(offset + 46, offset + 46 + nameLen).toString("utf8");
    offset += 46 + nameLen + extraLen + commentLen;

    if (name.toUpperCase().endsWith(".BIN") && !name.includes("/")) {
      chosen = { name, method, compressedSize, localOffset };
    } else if (!chosen && name.toUpperCase().endsWith(".BIN")) {
      chosen = { name, method, compressedSize, localOffset };
    }
  }

  if (!chosen) {
    throw new Error("No .BIN file found in the IP2Location zip");
  }

  const local = chosen.localOffset;
  if (buf.readUInt32LE(local) !== 0x04034b50) {
    throw new Error("Invalid ZIP local header");
  }
  const nameLen = buf.readUInt16LE(local + 26);
  const extraLen = buf.readUInt16LE(local + 28);
  const dataStart = local + 30 + nameLen + extraLen;
  const data = buf.subarray(dataStart, dataStart + chosen.compressedSize);

  let output;
  if (chosen.method === 0) output = data;
  else if (chosen.method === 8) output = zlib.inflateRawSync(data);
  else throw new Error(`Unsupported zip compression ${chosen.method}`);

  fs.mkdirSync(path.dirname(destBin), { recursive: true });
  fs.writeFileSync(destBin, output);
  return destBin;
}
