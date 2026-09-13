const fs = require("fs");
const https = require("https");

const API_KEY = process.env.YOUTUBE_API_KEY;
const BATCH_SIZE = 50;

if (!API_KEY) {
  console.error("Missing YOUTUBE_API_KEY");
  process.exit(1);
}

// data.json から全曲分の videoId を重複なしで抽出
let data = [];
try {
  data = JSON.parse(fs.readFileSync("data.json", "utf-8"));
} catch (e) {
  console.error("Failed to read data.json:", e.message);
  process.exit(1);
}

const videoIds = [...new Set(data.map(d => d.videoId).filter(Boolean))];

function chunk(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function fetchStatusBatch(ids) {
  return new Promise((resolve, reject) => {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=status&id=${ids.join(",")}&key=${API_KEY}`;

    https.get(url, (res) => {
      let raw = "";

      res.on("data", (c) => { raw += c; });

      res.on("end", () => {
        try {
          const json = JSON.parse(raw);

          if (json.error) {
            reject(new Error(JSON.stringify(json.error)));
            return;
          }

          resolve(json.items || []);
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

// privacyStatus -> サイト内部で使うstatus値への変換
// private / それ以外の想定外の値も念のため gone 扱いにする
function mapPrivacyStatus(privacyStatus) {
  if (privacyStatus === "public") return "public";
  if (privacyStatus === "unlisted") return "unlisted";
  return "gone";
}

(async () => {
  const checkedAt = new Date().toISOString();
  const videos = {};

  // まず全件 gone で初期化しておき、API側でIDが返ってこなかったものは gone のまま残す
  videoIds.forEach(id => { videos[id] = "gone"; });

  const batches = chunk(videoIds, BATCH_SIZE);

  for (const batch of batches) {
    let items;

    try {
      items = await fetchStatusBatch(batch);
    } catch (e) {
      // 通信/API側の失敗時は既存のstatus.jsonを壊さないよう、ここで処理を中断する
      console.error("Failed to fetch status batch:", e.message);
      process.exit(1);
    }

    items.forEach(item => {
      const privacyStatus = item.status?.privacyStatus;
      videos[item.id] = mapPrivacyStatus(privacyStatus);
    });
  }

  const output = { checkedAt, videos };

  fs.writeFileSync("status.json", JSON.stringify(output, null, 2));
  console.log(`status.json updated: ${videoIds.length} videos checked at ${checkedAt}`);
})();
