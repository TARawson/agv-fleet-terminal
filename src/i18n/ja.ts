import type en from './en';

type Catalog<T> = {
  [K in keyof T]: T[K] extends string ? string : Catalog<T[K]>;
};

const ja: Catalog<typeof en> = {
  language: {
    switchTo: '言語を{{language}}に切り替える',
    en: 'EN',
    ja: '日本語',
  },
  tabs: {
    dashboard: 'フリート状況',
    dashboardShort: '状況',
    map: 'フリート監視',
    mapShort: '監視',
    pick: '作業端末',
    pickShort: '作業',
    alarms: '診断',
    alarmsShort: '診断',
  },
  zone: {
    label: '稼働エリア',
    WEST: '西',
    EAST: '東',
    none: '—',
  },
  link: {
    OFFLINE: '切断',
    connecting: '接続中',
    live: '接続',
    latency: '{{ms}} ms',
  },
  dashboard: {
    estop: '非常停止',
    release: '解除',
    estopLabel: '非常停止',
    releaseLabel: '非常停止を解除',
    active: '稼働',
    charging: '充電',
    faulted: '異常',
    recent: '直近の動き',
    waiting: '車両の動きを待っています',
  },
  status: {
    IDLE: '待機',
    NAVIGATING: '走行',
    CHARGING: '充電',
    FAULT: '異常',
    ESTOP: '非常停止',
  },
  severity: {
    WARNING: '警告',
    CRITICAL: '重大',
  },
  events: {
    ESTOP: '{{id}} 非常停止',
    FAULT: '{{id}} 異常',
    CHARGING: '{{id}} 充電中',
    IDLE: '{{id}} が {{place}} で待機',
    NAVIGATING: '{{id}} が {{place}} へ走行中',
    enRoute: '{{id}} が {{destination}} へ向かっています',
    alarm: '{{id}} · {{message}}',
    link: 'フリート接続 · {{count}} 台',
    waypoint: '地点',
  },
  alarms: {
    all: 'すべて',
    empty: '警報はありません',
    clear: '解除',
    clearLabel: '{{id}} の {{code}} を解除',
    LOW_BATTERY: 'バッテリーが警告閾値を下回っています',
    OPTICAL_OBSTRUCTION: '前方スキャナで光学的な遮蔽を検出しました',
  },
  map: {
    hint: '車両をタップして状態を表示',
    floor: '倉庫フロア',
  },
  vehicle: {
    battery: 'バッテリー {{percent}}%',
    speed: '速度',
    speedValue: '{{speed}} u/s',
    destination: '目的地',
    payload: '荷',
    none: 'なし',
    empty: '空',
    close: '閉じる',
    dismiss: '車両詳細を閉じる',
  },
  pick: {
    steps: {
      bin: '棚番',
      pallet: 'パレット',
      agv: 'AGV',
      dispatch: '配車',
    },
    cameraUnavailable: 'カメラを使えません',
    cameraOff: 'カメラがオフです。下にコードを入力してください。',
    cameraChecking: 'カメラを確認しています…',
    enableCamera: 'カメラを許可',
    binCode: '棚番コード',
    palletId: 'パレットID',
    useCode: 'コードを使う',
    bin: '棚番',
    pallet: 'パレット',
    selectAgv: '配車する車両',
    waypointFor: '目的地（{{id}}）',
    sending: '送信中…',
    dispatch: '配車',
    rejected: '配車が拒否されました。車両が異常か、フリートが停止しています。',
    done: '{{id}} が {{pallet}} を {{destination}} へ搬送中です。',
    newTask: '新しい作業',
    restart: 'やり直す',
  },
};

export default ja;
