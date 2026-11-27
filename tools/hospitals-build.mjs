// 사본: 원본은 비공개 저장소 daengdaeng-care의 backend/scripts/hospitals-build.mjs(고치면 함께 맞춘다). 비밀값 없음 — 키는 GitHub Secrets.
// 동물병원 목록 파일 만들기(PRD FR-12, 2026-11-27 사용자 승인 1단계). 행정안전부_동물_동물병원 조회서비스(디지털융합플랫폼)를
// 처음부터 끝까지 받아 영업 중(SALS_STTS_CD=01)인 병원만 남기고, 좌표를 위경도로 바꿔 시도별 JSON으로 저장한다.
//   node scripts/hospitals-build.mjs [출력 폴더]      기본 출력: backend/.local-hospitals/ (Git 제외)
//   HOSPITALS_RAW=1                                   받은 원본도 출력 폴더에 raw.json으로 저장(진단용)
//   HOSPITALS_FROM_RAW=<raw.json>                     다시 받지 않고 저장한 원본으로 파일만 다시 만든다
// 키: 환경변수 KOREACONNECT_API_KEY(또는 DATA_GO_KR_SERVICE_KEY), 없으면 .env.hospitals.local → .env.neon.local 순서로 읽는다.
//   키는 요청 헤더 api_user_key_id로만 보낸다(질의 serviceKey로 보내면 안쪽 서버가 거절, 2026-11-27 확인). 출력·파일에 키를 남기지 않는다.
// 알아 둘 것(2026-11-27 실제 응답 확인):
//   - 검색 조건 cond[...]을 붙이면 503이 나서 조건 없이 100건씩 전부 받고 여기서 거른다. 가끔 503이 나므로 잠시 쉬고 다시 시도한다.
//   - 좌표 CRD_INFO_X/Y는 EPSG:5174(보정계수 없는 Bessel 중부원점 TM). 영업 중 표본의 94%에 있다. 우리나라 밖으로 떨어지면 버린다.
//   - 전화번호 TELNO는 60% 정도만 있다. 영업 중(인허가 기준) ≠ 지금 진료 중. 앱은 "방문 전 전화로 확인"을 늘 붙인다.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const URL_BASE = 'https://api.koreaconnect.kr/01/1/2603101713597416530PDP/AGFOOD/1741000/animal_hospitals/info';
const SOURCE = '행정안전부_동물_동물병원 조회서비스(디지털융합플랫폼·공공데이터포털)';
const ROWS = 100;

proj4.defs('EPSG:5174', '+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +units=m +no_defs '
  + '+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43');

// 시도 이름 → 파일 이름(짧은 영문). 주소의 첫 낱말로 고른다. 예전 이름(강원도·전라북도)도 받는다.
export const SIDO = [
  ['서울특별시', 'seoul'], ['부산광역시', 'busan'], ['대구광역시', 'daegu'], ['인천광역시', 'incheon'],
  ['대전광역시', 'daejeon'], ['울산광역시', 'ulsan'], ['세종특별자치시', 'sejong'], ['경기도', 'gyeonggi'],
  ['강원특별자치도', 'gangwon'], ['충청북도', 'chungbuk'], ['충청남도', 'chungnam'], ['전북특별자치도', 'jeonbuk'],
  // 2026-11-27 확인: 광주·전남 주소가 '전남광주통합특별시'로 온다(행정구역 통합). 한 파일로 묶고 예전 이름도 여기로 보낸다.
  ['전남광주통합특별시', 'jeonnam-gwangju'], ['경상북도', 'gyeongbuk'], ['경상남도', 'gyeongnam'], ['제주특별자치도', 'jeju'],
];
const SIDO_ALIAS = { 강원도: '강원특별자치도', 전라북도: '전북특별자치도', 제주도: '제주특별자치도', 광주광역시: '전남광주통합특별시', 전라남도: '전남광주통합특별시' };

// 키 파일: 병원 전용 .env.hospitals.local을 먼저 본다(2026-11-27 사용자 승인: 서버 배포용 .env.neon.local과 분리해
// 배포 방식이 바뀌어도 이 키가 서버로 올라가지 않게). 예전 위치(.env.neon.local)도 읽는다.
export function readKey(env = process.env, files = ['.env.hospitals.local', '.env.neon.local'].map((f) => resolve(root, f))) {
  const direct = env.KOREACONNECT_API_KEY || env.DATA_GO_KR_SERVICE_KEY;
  if (direct) return direct.trim();
  for (const file of files) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const m = text.match(/^KOREACONNECT_API_KEY=(.+)$/m) || text.match(/^DATA_GO_KR_SERVICE_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

// 주소 → [시도, 시군구]. 시군구는 둘째 낱말(세종은 없음). 모르면 null.
export function areaOf(address) {
  const words = String(address ?? '').trim().split(/\s+/);
  const sido = SIDO_ALIAS[words[0]] ?? words[0];
  if (!SIDO.some(([name]) => name === sido)) return [null, null];
  const sigungu = sido === '세종특별자치시' ? null : words[1] ?? null;
  return [sido, sigungu];
}

// EPSG:5174 → [위도, 경도](소수 6자리). 값이 없거나 우리나라 밖이면 null.
export function toLatLng(x, y) {
  const fx = Number(x); const fy = Number(y);
  if (!String(x ?? '').trim() || !String(y ?? '').trim() || !Number.isFinite(fx) || !Number.isFinite(fy)) return null;
  const [lng, lat] = proj4('EPSG:5174', 'WGS84', [fx, fy]);
  if (!(lat > 33 && lat < 39 && lng > 124.5 && lng < 132)) return null;
  return [Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6];
}

// 응답 한 줄 → 앱이 쓸 한 줄(영업 중만). 개인 정보는 없고 공개된 사업장 정보만 담는다.
export function toHospital(row) {
  if (row?.SALS_STTS_CD !== '01') return null;
  const road = String(row.ROAD_NM_ADDR ?? '').trim();
  const jibun = String(row.LOTNO_ADDR ?? '').trim();
  const [sido, sigungu] = areaOf(road || jibun);
  if (!sido || !String(row.BPLC_NM ?? '').trim()) return null;
  const point = toLatLng(row.CRD_INFO_X, row.CRD_INFO_Y);
  const tel = String(row.TELNO ?? '').replace(/\s+/g, '').trim();
  return {
    id: String(row.MNG_NO), name: String(row.BPLC_NM).trim(), sido, sigungu, road: road || null, jibun: jibun || null,
    tel: tel || null, lat: point ? point[0] : null, lng: point ? point[1] : null,
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function page(key, pageNo) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const res = await fetch(`${URL_BASE}?returnType=json&numOfRows=${ROWS}&pageNo=${pageNo}`,
        { headers: { api_user_key_id: key }, signal: AbortSignal.timeout(30_000) });
      if (res.status === 200) {
        const body = (await res.json())?.response?.body;
        if (!body) throw new Error('응답 모양이 다름');
        const items = body.items?.item ?? [];
        return { total: Number(body.totalCount), items: Array.isArray(items) ? items : [items] };
      }
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`키가 거절됐어요(HTTP ${res.status})`), { fatal: true });
      console.error(`  ${pageNo}쪽 HTTP ${res.status} — ${attempt}번째, 잠시 뒤 다시`);
    } catch (error) {
      if (error.fatal) throw error;
      console.error(`  ${pageNo}쪽 실패(${error.message}) — ${attempt}번째, 잠시 뒤 다시`);
    }
    await wait(3000 * attempt);
  }
  throw new Error(`${pageNo}쪽을 6번 시도해도 받지 못했어요`);
}

async function main() {
  const out = resolve(process.argv[2] ?? resolve(root, '.local-hospitals'));
  const started = Date.now();
  if (process.env.HOSPITALS_FROM_RAW) return write(JSON.parse(readFileSync(process.env.HOSPITALS_FROM_RAW, 'utf8')), out, started);
  const key = readKey();
  if (!key) { console.error('키가 없어요: KOREACONNECT_API_KEY(또는 DATA_GO_KR_SERVICE_KEY)'); process.exit(2); }
  const first = await page(key, 1);
  const pages = Math.ceil(first.total / ROWS);
  console.log(`전체 ${first.total}건 · ${pages}쪽 받기 시작`);
  const rows = [...first.items];
  for (let p = 2; p <= pages; p += 1) {
    rows.push(...(await page(key, p)).items);
    if (p % 20 === 0) console.log(`  ${p}/${pages}쪽`);
    await wait(300);
  }
  if (rows.length < first.total * 0.98) throw new Error(`받은 줄(${rows.length})이 전체(${first.total})보다 많이 적어요 — 저장하지 않음`);
  // 진단용 원본(Git 제외 폴더). HOSPITALS_RAW=1 일 때만 저장한다.
  if (process.env.HOSPITALS_RAW === '1') { mkdirSync(out, { recursive: true }); writeFileSync(resolve(out, 'raw.json'), JSON.stringify(rows)); }
  return write(rows, out, started);
}

function write(rows, out, started) {

  // 영업 중인데 시도를 못 알아본 주소의 첫 낱말을 센다(새 표기가 생기면 알 수 있게).
  const unknown = {};
  for (const r of rows) if (r.SALS_STTS_CD === '01' && !areaOf(String(r.ROAD_NM_ADDR || r.LOTNO_ADDR || ''))[0]) {
    const w = String(r.ROAD_NM_ADDR || r.LOTNO_ADDR || '(빈 주소)').trim().split(/\s+/)[0]; unknown[w] = (unknown[w] ?? 0) + 1; }
  if (Object.keys(unknown).length) console.log('시도를 못 알아본 주소 첫 낱말:', JSON.stringify(unknown));
  const seen = new Set();
  const hospitals = rows.map(toHospital).filter((h) => h && !seen.has(h.id) && seen.add(h.id));
  const now = new Date().toISOString();
  mkdirSync(out, { recursive: true });
  // 내용이 그대로인 시도 파일은 다시 쓰지 않고 그 파일의 기준일을 지킨다(자동 갱신이 매주 같은 내용을 커밋하지 않게, 2026-11-27).
  const readOld = (path) => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
  const areas = []; let changed = 0;
  for (const [sido, file] of SIDO) {
    const list = hospitals.filter((h) => h.sido === sido).sort((a, b) => (a.sigungu ?? '').localeCompare(b.sigungu ?? '', 'ko') || a.name.localeCompare(b.name, 'ko'))
      .map(({ sido: _s, ...h }) => h);
    const sigungu = [...new Set(list.map((h) => h.sigungu).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
    const path = resolve(out, `${file}.json`);
    const old = readOld(path);
    const same = old && JSON.stringify(old.hospitals) === JSON.stringify(list);
    const updatedAt = same ? old.updatedAt : now;
    if (!same) { writeFileSync(path, JSON.stringify({ sido, updatedAt, hospitals: list })); changed += 1; }
    areas.push({ sido, file: `${file}.json`, count: list.length, updatedAt, sigungu });
  }
  const index = { source: SOURCE, note: '인허가 정보 기준(2일 전 현행화). 영업 중 ≠ 지금 진료 중 — 방문 전 전화로 확인하세요.',
    updatedAt: areas.map((a) => a.updatedAt).sort().at(-1), areas };
  const indexPath = resolve(out, 'index.json');
  if (JSON.stringify(readOld(indexPath)) !== JSON.stringify(index)) writeFileSync(indexPath, JSON.stringify(index, null, 1));
  const pct = (f) => Math.round((100 * hospitals.filter(f).length) / Math.max(1, hospitals.length));
  console.log(JSON.stringify({ received: rows.length, open: hospitals.length, withPoint: `${pct((h) => h.lat !== null)}%`,
    withTel: `${pct((h) => h.tel)}%`, changedAreas: changed, seconds: Math.round((Date.now() - started) / 1000), out }, null, 1));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`실패: ${error.message}`); process.exit(1); });
}
