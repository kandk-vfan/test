const fs = require("fs");
const https = require("https");

const API_KEY = process.env.YOUTUBE_API_KEY;
const text = fs.readFileSync("songs.txt", "utf-8");
const lines = text.split(/\r?\n/);

let videoId = "";
let videoInfo = null;
const results = [];
const streamNotes = {};
const manualStatuses = {};

// songs.txtに手動で書く status: の日本語表記 -> 内部コード
const STATUS_MAP = {
  "メンバー限定": "members",
  "限定公開": "unlisted",
  "非公開": "gone",
  "削除": "gone"
};

// check_status.js が生成した自動判定結果(public/unlisted/gone)
let autoStatus = {};
try {
  autoStatus = JSON.parse(fs.readFileSync("status.json", "utf-8")).videos || {};
} catch (e) {
  autoStatus = {};
}

let existing = [];
try {
  existing = JSON.parse(fs.readFileSync("data.json", "utf-8"));
} catch (e) {
  existing = [];
}

const videoCache = {};

for (const item of existing) {
  if (!videoCache[item.videoId]) {
    videoCache[item.videoId] = {
      title: item.videoTitle,
      date: item.date
    };
  }
}

function extractVideoId(url) {
  const patterns = [
    /[?&]v=([^&]+)/,
    /youtu\.be\/([^?&/]+)/,
    /youtube\.com\/live\/([^?&/]+)/,
    /youtube\.com\/embed\/([^?&/]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return "";
}

function fetchVideoInfo(videoId) {
  return new Promise((resolve, reject) => {
    if (!API_KEY) {
      reject(new Error("Missing YOUTUBE_API_KEY"));
      return;
    }

    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${videoId}&key=${API_KEY}`;

    https.get(url, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const json = JSON.parse(data);

          if (!json.items || json.items.length === 0) {
            console.warn(`skip videoId: ${videoId}`);
            resolve(null);
            return;
          }

          const item = json.items[0];

          resolve({
            title: item.snippet.title,
            date:
              item.liveStreamingDetails?.actualStartTime
              || item.snippet.publishedAt
          });
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

function parseSongLine(line) {
  const timeMatch = line.match(/^(\d{1,2}:\d{2}:\d{2})\s+(.*)$/);
  if (!timeMatch) return null;

  const time = timeMatch[1];
  let rest = timeMatch[2];

  let note = "";

  const pipeIndex = rest.lastIndexOf("|");
  if (pipeIndex !== -1) {
    note = rest.slice(pipeIndex + 1).trim();
    rest = rest.slice(0, pipeIndex).trim();
  }

  const separator = " / ";
  const idx = rest.lastIndexOf(separator);

  if (idx === -1) {
    return {
      time,
      title: rest.trim(),
      artist: "",
      note
    };
  }

  return {
    time,
    title: rest.slice(0, idx).trim(),
    artist: rest.slice(idx + separator.length).trim(),
    note
  };
}

(async () => {
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("video:")) {
      const url = line.replace(/^video:\s*/, "");
      videoId = extractVideoId(url);
      if (videoCache[videoId]) {
        videoInfo = videoCache[videoId];
      } else {
        videoInfo = await fetchVideoInfo(videoId);
    
        if (!videoInfo) {
          videoId = "";
          continue;
        }
    
        videoCache[videoId] = videoInfo;
      }
      continue;
    }
    
    if (line.startsWith("note:")) {
      if (videoId) {
        streamNotes[videoId] = line.replace(/^note:\s*/, "").trim();
      }
      continue;
    }
    
    if (line.startsWith("status:")) {
      if (videoId) {
        const raw = line.replace(/^status:\s*/, "").trim();
        manualStatuses[videoId] = STATUS_MAP[raw] || raw;
      }
      continue;
    }
    
    const parsed = parseSongLine(line);
    if (!parsed || !videoId || !videoInfo) continue;

    results.push({
      title: parsed.title,
      artist: parsed.artist,
      note: parsed.note || "",
      streamNote: "",
      status: "",
      videoId,
      videoTitle: videoInfo.title,
      date: videoInfo.date,
      time: parsed.time
    });
  }

  results.forEach(item => {
    item.streamNote = streamNotes[item.videoId] || "";
    item.status = manualStatuses[item.videoId]
      || autoStatus[item.videoId]
      || "public";
  });
  
  fs.writeFileSync("data.json", JSON.stringify(results, null, 2));
})();
