import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const CATEGORY_LABELS = {
  seating: "소파·의자",
  tables: "책상·테이블",
  sleeping: "침실",
  storage: "수납",
  "kitchen-dining": "주방·다이닝",
  "bathroom-laundry": "욕실·세탁",
  lighting: "조명",
  decor: "데코",
  outdoor: "야외",
  electronics: "가전·전자",
};

const TARGET_COUNT = 50;
const DATASET_ROOT = path.resolve("runtime-assets/furniture-glb-dataset");
const CATALOG_PATH = path.join(DATASET_ROOT, "catalog.json");
const MANIFEST_PATH = path.join(DATASET_ROOT, "manifest.json");

const POLYHAVEN_EXTRA_MODELS = [
  ["Camera_01", "electronics", "카메라"],
  ["CashRegister_01", "electronics", "금전등록기"],
  ["Megaphone_01", "electronics", "메가폰"],
  ["Television_01", "electronics", "브라운관 텔레비전"],
  ["alarm_clock_01", "electronics", "알람시계"],
  ["boombox", "electronics", "붐박스 라디오"],
  ["cassette_player", "electronics", "카세트 플레이어"],
  ["classic_laptop", "electronics", "클래식 노트북"],
  ["electric_stove", "electronics", "전기 스토브"],
  ["exterior_aircon_unit", "electronics", "실외기"],
  ["filmstrip_projector_8mm", "electronics", "8mm 필름 프로젝터"],
  ["gaming_console", "electronics", "게임 콘솔"],
  ["circuit_board", "electronics", "회로 기판"],
  ["korean_public_payphone_01", "electronics", "공중전화"],
  ["portable_generator", "electronics", "휴대용 발전기"],
  ["power_box_01", "electronics", "전원 분전함"],
  ["metal_detector", "electronics", "금속 탐지기"],
  ["Drill_01", "electronics", "전동 드릴"],
  ["industrial_microscope", "electronics", "산업용 현미경"],
  ["portable_searchlight", "electronics", "휴대용 탐조등"],
  ["drain_cleaner", "bathroom-laundry", "배수구 세정기"],
  ["plunger", "bathroom-laundry", "변기 압축기"],
  ["all_purpose_cleaner", "bathroom-laundry", "다목적 세정제"],
  ["bleach_bottle", "bathroom-laundry", "표백제 용기"],
  ["dustpan", "bathroom-laundry", "쓰레받기"],
  ["plastic_broom", "bathroom-laundry", "플라스틱 빗자루"],
  ["multi_cleaner_5_litre", "bathroom-laundry", "대용량 세정제"],
  ["multi_cleaner_bottle", "bathroom-laundry", "세정제 병"],
  ["ClassicConsole_01", "tables", "클래식 콘솔 테이블"],
  ["CoffeeTable_01", "tables", "커피 테이블"],
  ["SchoolDesk_01", "tables", "학교 책상"],
  ["WoodenTable_01", "tables", "원목 테이블 1"],
  ["WoodenTable_02", "tables", "원목 테이블 2"],
  ["WoodenTable_03", "tables", "원목 테이블 3"],
  ["dining_table", "kitchen-dining", "다이닝 테이블"],
  ["coffee_table_round_01", "kitchen-dining", "원형 커피 테이블"],
  ["side_table_01", "kitchen-dining", "사이드 테이블"],
  ["CoffeeCart_01", "kitchen-dining", "커피 카트"],
  ["chinese_console_table", "kitchen-dining", "중식 콘솔 테이블"],
  ["chinese_tea_table", "kitchen-dining", "차 테이블"],
  ["gallinera_table", "kitchen-dining", "갤리네라 테이블"],
  ["gothic_coffee_table", "kitchen-dining", "고딕 커피 테이블"],
  ["industrial_coffee_table", "kitchen-dining", "산업용 커피 테이블"],
  ["metal_office_desk", "kitchen-dining", "메탈 데스크"],
  ["modern_coffee_table_01", "kitchen-dining", "모던 커피 테이블 1"],
  ["modern_coffee_table_02", "kitchen-dining", "모던 커피 테이블 2"],
  ["painted_wooden_table", "kitchen-dining", "페인트 원목 테이블"],
  ["round_wooden_table_01", "kitchen-dining", "원형 원목 테이블 1"],
  ["round_wooden_table_02", "kitchen-dining", "원형 원목 테이블 2"],
  ["side_table_tall_01", "kitchen-dining", "높은 사이드 테이블"],
  ["small_wooden_table_01", "kitchen-dining", "소형 원목 테이블"],
  ["wooden_picnic_table", "kitchen-dining", "피크닉 다이닝 테이블"],
  ["outdoor_table_chair_set_01", "kitchen-dining", "테이블·체어 다이닝 세트"],
  ["modern_wooden_cabinet", "kitchen-dining", "모던 주방 수납장"],
  ["ornate_mirror_01", "bathroom-laundry", "장식 거울"],
  ["Chandelier_01", "lighting", "샹들리에 1"],
  ["Chandelier_02", "lighting", "샹들리에 2"],
  ["Chandelier_03", "lighting", "샹들리에 3"],
  ["caged_hanging_light", "lighting", "케이지 펜던트 조명"],
  ["desk_lamp_arm_01", "lighting", "암 데스크 램프"],
  ["industrial_wall_lamp", "lighting", "산업용 벽등"],
  ["modern_ceiling_lamp_01", "lighting", "모던 천장등"],
  ["lightbulb_01", "lighting", "백열 전구"],
].map(([name, category, displayNameKo]) => ({
  name,
  category,
  sourceRoot: "runtime-assets/_imports/polyhaven-cc0",
  sourceRelativePath: `${name}.glb`,
  displayNameKo,
  license: "CC0-1.0",
  sourceUrl: `https://polyhaven.com/a/${name}`,
  targetPrefix: "polyhaven-",
}));

const EXTRA_MODELS = [
  ...POLYHAVEN_EXTRA_MODELS,
  ...["bathroomCabinet", "bathroomCabinetDrawer", "bathroomMirror", "bathroomSink", "bathroomSinkSquare", "bathtub", "shower", "showerRound", "toilet", "toiletSquare", "dryer", "washer", "washerDryerStacked"].map((name) => ({
    name,
    category: "bathroom-laundry",
    sourceRelativePath: `Models/GLTF format/${name}.glb`,
    displayNameKo: {
      bathroomCabinet: "기본 욕실 수납장",
      bathroomCabinetDrawer: "서랍형 욕실 수납장",
      bathroomMirror: "욕실 거울",
      bathroomSink: "욕실 세면대",
      bathroomSinkSquare: "사각 세면대",
      bathtub: "욕조",
      shower: "샤워 부스",
      showerRound: "원형 샤워 부스",
      toilet: "변기",
      toiletSquare: "사각형 변기",
      dryer: "건조기",
      washer: "세탁기",
      washerDryerStacked: "세탁기·건조기 일체형",
    }[name],
  })),
  ...["kitchenFridge", "kitchenFridgeBuiltIn", "kitchenFridgeLarge", "kitchenFridgeSmall", "kitchenMicrowave", "kitchenStove", "kitchenStoveElectric", "computerKeyboard", "computerMouse", "computerScreen", "laptop", "radio", "speaker", "speakerSmall", "televisionAntenna", "televisionModern", "televisionVintage", "toaster"].map((name) => ({
    name,
    category: "electronics",
    sourceRelativePath: `Models/GLTF format/${name}.glb`,
    displayNameKo: {
      kitchenFridge: "냉장고",
      kitchenFridgeBuiltIn: "빌트인 냉장고",
      kitchenFridgeLarge: "대형 냉장고",
      kitchenFridgeSmall: "소형 냉장고",
      kitchenMicrowave: "전자레인지",
      kitchenStove: "가스레인지",
      kitchenStoveElectric: "전기레인지",
      computerKeyboard: "컴퓨터 키보드",
      computerMouse: "컴퓨터 마우스",
      computerScreen: "컴퓨터 모니터",
      laptop: "노트북",
      radio: "라디오",
      speaker: "스피커",
      speakerSmall: "소형 스피커",
      televisionAntenna: "안테나 텔레비전",
      televisionModern: "평면 텔레비전",
      televisionVintage: "빈티지 텔레비전",
      toaster: "토스터",
      ceilingFan: "천장형 선풍기",
    }[name],
  })),
  ...["kitchenBlender", "kitchenCoffeeMachine"].map((name) => ({
    name,
    category: "electronics",
    sourceRelativePath: `Models/GLTF format/${name}.glb`,
    displayNameKo: { kitchenBlender: "블렌더", kitchenCoffeeMachine: "커피 머신" }[name],
  })),
  ...["hoodLarge", "hoodModern", "kitchenBar", "kitchenBarEnd", "kitchenCabinet", "kitchenCabinetCornerInner", "kitchenCabinetCornerRound", "kitchenCabinetDrawer", "kitchenCabinetUpper", "kitchenCabinetUpperCorner", "kitchenCabinetUpperDouble", "kitchenCabinetUpperLow", "kitchenSink", "table", "tableRound", "tableGlass", "tableCross", "tableCloth", "sideTable", "sideTableDrawers", "stoolBar", "stoolBarSquare"].map((name) => ({
    name,
    category: "kitchen-dining",
    sourceRelativePath: `Models/GLTF format/${name}.glb`,
    displayNameKo: `주방·다이닝 ${name}`,
  })),
  ...["ceilingFan", "dryer", "washer", "washerDryerStacked"].map((name) => ({
    name,
    category: "electronics",
    sourceRelativePath: `Models/GLTF format/${name}.glb`,
    displayNameKo: name,
  })),
  ...["bench", "benchCushion", "benchCushionLow", "chair", "chairCushion", "chairModernCushion", "chairModernFrameCushion", "chairRounded", "chairDesk", "tableCoffee", "tableCoffeeGlass", "tableCoffeeGlassSquare", "tableCoffeeSquare", "tableCrossCloth", "loungeDesignChair", "loungeChair", "loungeChairRelax", "loungeDesignSofa", "loungeDesignSofaCorner", "table"].map((name) => ({
    name,
    category: "kitchen-dining",
    sourceRelativePath: `Models/GLTF format/${name}.glb`,
    displayNameKo: `식탁·다이닝 ${name}`,
  })),
  ...["deskCorner", "table", "tableRound", "tableGlass", "tableCross", "tableCloth", "tableCoffee", "tableCoffeeGlass", "tableCoffeeGlassSquare", "tableCoffeeSquare", "tableCrossCloth", "sideTable", "sideTableDrawers"].map((name) => ({
    name,
    category: "tables",
    sourceRelativePath: `Models/GLTF format/${name}.glb`,
    displayNameKo: name,
  })),
  ...["dine_table_01", "coffee_table_01"].map((name) => ({
    name,
    category: "tables",
    sourceRoot: "runtime-assets/_imports/mastjie-household-goods/extracted",
    sourceRelativePath: `gltf/${name}.glb`,
    displayNameKo: name,
  })),
  ...["trashcan"].map((name) => ({
    name,
    category: "bathroom-laundry",
    sourceRelativePath: `Models/GLTF format/${name}.glb`,
    displayNameKo: `욕실 수납 ${name}`,
  })),
  ...["hoodLarge", "hoodModern"].map((name) => ({
    name,
    category: "electronics",
    sourceRelativePath: `Models/GLTF format/${name}.glb`,
    displayNameKo: `주방 설비 ${name}`,
  })),
  ...[
    ["air_conditioner_01", "스탠드 에어컨"], ["blender_01", "블렌더"],
    ["computer_01", "데스크톱 컴퓨터"], ["fridge_01", "냉장고"], ["kettle_01", "전기포트"],
    ["microwave_01", "전자레인지"], ["rice_cooker_01", "전기밥솥"], ["stove_01", "가스레인지"], ["toaster_01", "토스터"],
    ["tv_01", "텔레비전"], ["washing_machine_01", "세탁기"],
  ].map(([name, displayNameKo]) => ({
    name,
    category: "electronics",
    sourceRoot: "runtime-assets/_imports/mastjie-household-goods/extracted",
    sourceRelativePath: `gltf/${name}.glb`,
    displayNameKo,
  })),
  ...["dine_table_01", "coffee_table_01"].map((name) => ({
    name,
    category: "kitchen-dining",
    sourceRoot: "runtime-assets/_imports/mastjie-household-goods/extracted",
    sourceRelativePath: `gltf/${name}.glb`,
    displayNameKo: name,
  })),
  ...["ceiling_fan_01", "laptop_01"].map((name) => ({
    name,
    category: "electronics",
    sourceRoot: "runtime-assets/_imports/mastjie-household-goods/extracted",
    sourceRelativePath: `gltf/${name}.glb`,
    displayNameKo: name === "laptop_01" ? "노트북" : `주방 설비 ${name}`,
  })),
  ...[
    ["pendaflour_lamp_01", "펜던트 조명"],
    ["table_lamp_01", "테이블 램프"],
    ["ceiling_fan_01", "천장형 선풍기"],
  ].map(([name, displayNameKo]) => ({
    name,
    category: "lighting",
    sourceRoot: "runtime-assets/_imports/mastjie-household-goods/extracted",
    sourceRelativePath: `gltf/${name}.glb`,
    displayNameKo,
  })),
  ...["ceilingFan"].map((name) => ({
    name,
    category: "lighting",
    sourceRelativePath: `Models/GLTF format/${name}.glb`,
    displayNameKo: "천장형 선풍기",
  })),
  ...["lampRoundFloor", "lampRoundTable", "lampSquareCeiling", "lampSquareFloor", "lampSquareTable", "lampWall"].map((name) => ({
    name,
    category: "lighting",
    sourceRelativePath: `Models/GLTF format/${name}.glb`,
    displayNameKo: {
      lampRoundFloor: "원형 플로어 램프",
      lampRoundTable: "원형 테이블 램프",
      lampSquareCeiling: "사각형 천장등",
      lampSquareFloor: "사각형 플로어 램프",
      lampSquareTable: "사각형 테이블 램프",
      lampWall: "벽부착등",
    }[name],
  })),
];

const IRRELEVANT_PATTERN = /(?:drawer-front|cutlery|utensil|tray|shelf-for-|push-opener|napkin|tea-towel|place-mat|door-mat|dish-washing-brush|spatula|grater|knife|pizza-cutter|zester|ladle|skimmer|measuring|chopping|frying-pan|mixing-bowl|serving-bowl|bowl|plate(?:[-_ ]|\.glb|$)|mug|cup-with|jar-with|candle|toy|building-block|abacus|bead-maze|soft-toy|shoehorn|vacuum-flask|food|salmon|(?:^|[/_-])wall(?:window|door|corner|half)?\.glb|floor(?:full|half|corner)\.glb|doorway|paneling|stairs|books\.glb)/i;
const ELECTRONICS_PRODUCT_PATTERN = /(?:air[-_ ]?condition|aircon|blender|coffee[-_ ]?machine|computer|dryer|fridge|kettle|laptop|microwave|monitor|mouse|keyboard|printer|radio|rice[-_ ]?cooker|router|screen|speaker|stove|television|(?:^|[-_ ])tv(?:[-_ ]|\.glb|$)|toaster|washer|washing[-_ ]?machine|dishwasher|oven|hood|fan|vacuum[-_ ]?cleaner|iron|charger|projector|camera|phone|tablet|cash[-_ ]?register|megaphone|boombox|cassette|alarm[-_ ]?clock|filmstrip|gaming[-_ ]?console|circuit[-_ ]?board|payphone|generator|power[-_ ]?box|metal[-_ ]?detector|drill|microscope|searchlight)/i;
const ELECTRONICS_FURNITURE_PATTERN = /(?:tv[-_ ]?(?:storage|bench|cabinet)|television[-_ ]?(?:storage|bench|cabinet)|laptop[-_ ]?(?:stand|support|table)|cabinet[-_ ]?television|kitchen[-_ ]?(?:bar|cabinet|sink)|(?:^|[-_ ])(?:bar|cabinet|bench|table|stand|support|storage|shelf)(?:[-_ ]|\.glb|$))/i;

function normalizedName(item) {
  return `${item.relativePath ?? ""} ${item.fileName ?? ""} ${item.displayNameKo ?? ""}`.replaceAll("\\", "/").toLowerCase();
}

function relevantName(item) {
  const fileName = item.fileName ?? path.basename(String(item.relativePath ?? ""));
  return `${fileName} ${item.displayNameKo ?? ""}`.replaceAll("\\", "/").toLowerCase();
}

function isCategoryRelevant(item, category) {
  const name = relevantName(item);
  if (category === "electronics") {
    return ELECTRONICS_PRODUCT_PATTERN.test(name) && !ELECTRONICS_FURNITURE_PATTERN.test(name) && !/(?:sink|cabinet|bar|storage|bench|stand|support|table|shelf)/i.test(name);
  }
  if (category === "lighting") {
    // Do not use the bare word `light`: IKEA colour names such as
    // `light-grey` and `light-yellow` otherwise turn plants, rugs and boards
    // into lighting products.
    return /(?:lamp|lighting|led|lantern|pendant|sconce|ceiling[-_ ]?fan|candle|candlestick|tealight|candelabra|chandelier|bulb|fluorescent|socket)/i.test(name)
      && !/(?:plant[-_ ]?pot|writing[-_ ]?board|rug|parasol|napkin|knife|tray|cutlery|ice[-_ ]?cream|lunch[-_ ]?box|bin|frame[-_ ]?light)/i.test(name);
  }
  if (category === "bathroom-laundry") {
    return /(?:bath|bathroom|toilet|shower|sink|wash|laundry|mirror|towel|soap|toilet[-_ ]?roll|nysjoen|taennforsen|trashcan|cleaner|bleach|plunger|plumbing|dustpan|broom)/i.test(name) && !/(?:kitchen|wardrobe|shoe|door[-_ ]?mat)/i.test(name);
  }
  if (category === "kitchen-dining") {
    return /(?:kitchen|dining|table|chair|bench|stool|island|counter|cabinet|sink|hood|cart)/i.test(name) && !/(?:lamp|plate|bowl|mug|cup|knife|rug|mat|towel|brush|organiser|utensil|soap|dishwasher|microwave|fridge|stove|toaster|blender|coffee[-_ ]?machine)/i.test(name);
  }
  if (category === "seating") return /(?:sofa|chair|armchair|footstool|stool|bench|lounge|seat)/i.test(name) && !/(?:toy|building[-_ ]?block|shoehorn)/i.test(name);
  if (category === "sleeping") return /(?:bed|mattress|day[-_ ]?bed|crib)/i.test(name);
  if (category === "tables") return /(?:table|desk|coffee|dining|console|bar)/i.test(name)
    && !/(?:vegetable|cutters?|cutlery|portable|tablet|turntable|lamp|knife|organiser|induction[-_ ]?hob|rack|desk[-_ ]?pad)/i.test(name);
  if (category === "storage") return /(?:wardrobe|cabinet|bookcase|shelving|sideboard|chest[-_ ]?of|storage|shoe[-_ ]?cabinet|trolley|rack|tv[-_ ]?(?:storage|bench)|television[-_ ]?(?:storage|bench))/i.test(name) && !/(?:laptop[-_ ]?(?:stand|support)|tablet[-_ ]?stand|cabinet[-_ ]?lighting|towel[-_ ]?rail|soap|laundry[-_ ]?(?:bag|basket)|tea[-_ ]?towel|shelf[-_ ]?for)/i.test(name);
  if (category === "decor") return /(?:rug|plant|picture|frame|pillow|vase|decor|clock|cushion)/i.test(name);
  if (category === "outdoor") return /(?:outdoor|parasol|sunshade|gazebo|garden|balcony|patio)/i.test(name);
  return true;
}

function classifyName(item) {
  const name = normalizedName(item);
  if (/(?:speaker.*lamp|lamp.*speaker|charger.*lighting|lighting.*charger)/i.test(name)) return "lighting";
  if (/outdoor|parasol|sunshade|gazebo|garden/.test(name)) return "outdoor";
  if (/bathroom|toilet|shower|sink|wash-basin|mirror|towel|laundry|bath-mat|soap-dispenser|wash-tub|nysjoen|taennforsen/.test(name)) return "bathroom-laundry";
  if (/(?:laptop[-_ ]?table|table[-_ ]?for[-_ ]?laptop)/i.test(name)) return "tables";
  if (/(?:lamp|lighting|led-|lantern|pendant|sconce|ceiling[-_ ]?fan|candle-holder|candlestick|tealight|candelabra|chandelier|bulb|fluorescent|socket)/i.test(name)) return "lighting";
  if (ELECTRONICS_FURNITURE_PATTERN.test(name)) {
    if (/(?:laptop[-_ ]?table|table[-_ ]?for[-_ ]?laptop)/i.test(name)) return "tables";
    return "storage";
  }
  if (/fridge|washer|dryer|television|\btv\b|computer|laptop|microwave|stove|speaker|radio|air-condition|fan|kettle|toaster|blender|coffee-machine|rice-cooker|alarm[-_ ]?clock|camera|cash[-_ ]?register|megaphone|boombox|cassette|filmstrip|gaming[-_ ]?console|circuit[-_ ]?board|payphone|generator|power[-_ ]?box|metal[-_ ]?detector|drill|microscope|searchlight/.test(name)) return "electronics";
  if (/sofa|chair|armchair|footstool|stool|bench|lounge|seat/.test(name)) return "seating";
  if (/bed|mattress|day-bed|crib/.test(name)) return "sleeping";
  if (/kitchen|dining|table-and-\d+-chairs|kitchenette|island|cookware|kitchen-roll|dish-drainer/.test(name)) return "kitchen-dining";
  if (/table|desk|coffee-table|dining|console|bar/.test(name) && !/table-lamp/.test(name)) return "tables";
  if (/wardrobe|cabinet|bookcase|shelving|sideboard|chest-of|storage|shoe-cabinet|trolley|rack/.test(name)) return "storage";
  if (/rug|plant|picture|mirror|pillow|vase|decor/.test(name)) return "decor";
  const sourceCategory = name.split("/")[0];
  const sourceFallback = {
    appliance: "electronics",
    bathroom: "bathroom-laundry",
    bed: "sleeping",
    chair: "seating",
    decor: "decor",
    "desk-table": "tables",
    kitchen: "kitchen-dining",
    lighting: "lighting",
    sofa: "seating",
    storage: "storage",
  }[sourceCategory];
  return item.catalogCategory && CATEGORY_LABELS[item.catalogCategory] ? item.catalogCategory : sourceFallback;
}

function categoryScore(item, category) {
  const name = normalizedName(item);
  let score = 0;
  if (item.catalogCategory === category) score += 20;
  if (item.category === category) score += 8;
  if (category === "bathroom-laundry" && /toilet|shower|sink|bath|mirror|cabinet|laundry|washer|dryer/.test(name)) score += 40;
  if (category === "electronics" && /fridge|washer|dryer|television|tv|computer|laptop|microwave|stove|speaker|radio|air-condition|fan/.test(name)) score += 40;
  if (category === "lighting" && /lamp|light|lantern|pendant|sconce|ceiling/.test(name)) score += 40;
  if (category === "seating" && /sofa|chair|armchair|bench|stool|footstool/.test(name)) score += 40;
  if (category === "sleeping" && /bed|mattress|day-bed/.test(name)) score += 40;
  if (category === "storage" && /wardrobe|cabinet|bookcase|shelving|sideboard|chest|storage/.test(name)) score += 40;
  if (category === "tables" && /table|desk|coffee|dining|console|bar/.test(name)) score += 40;
  if (category === "outdoor" && /outdoor|parasol|sunshade|gazebo|garden/.test(name)) score += 40;
  if (category === "decor" && /rug|plant|picture|pillow|vase|decor/.test(name)) score += 40;
  if (IRRELEVANT_PATTERN.test(name)) score -= 1000;
  if (item.thumbnailUrl) score += 2;
  if (item.sourceUrl) score += 1;
  return score;
}

function isIrrelevant(item, category) {
  const name = normalizedName(item);
  if (category === "kitchen-dining") {
    return /rug|dish-drying-mat|bowl|plate|mug|cup|cookware|butter-dish|tweezers|soap-dish|basket|kitchen-roll-holder/.test(name) || IRRELEVANT_PATTERN.test(name);
  }
  if (category === "bathroom-laundry") {
    return /door-mat|place-mat|kitchen-roll|dish-washing-brush/.test(name) || /drawer-front|shelf-for-|push-opener/.test(name);
  }
  if (category === "lighting") return /rug|ice-cream|pot-with|bin-with|frame-light/.test(name) || IRRELEVANT_PATTERN.test(name.replaceAll("candle", ""));
  return IRRELEVANT_PATTERN.test(name);
}

export { classifyName, geometrySignature, isCategoryRelevant, isIrrelevant };

function parseGlb(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error("Not a GLB file");
  let offset = 12;
  let json;
  let bin;
  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8").replace(/\u0000+$/g, "").trim());
    if (chunkType === 0x004e4942) bin = chunk;
    offset += 8 + chunkLength;
  }
  if (!json || !bin) throw new Error("GLB has no JSON/BIN chunks");
  return { json, bin };
}

function geometrySignature(buffer) {
  const { json, bin } = parseGlb(buffer);
  const values = [];
  const dracoPayloads = [];
  const meshes = json.meshes ?? [];
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives ?? []) {
      const draco = primitive.extensions?.KHR_draco_mesh_compression;
      if (draco?.bufferView != null) {
        const view = json.bufferViews?.[draco.bufferView];
        if (view) dracoPayloads.push(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
        continue;
      }
      const accessorIndex = primitive.attributes?.POSITION;
      const accessor = json.accessors?.[accessorIndex];
      const view = json.bufferViews?.[accessor?.bufferView];
      if (!accessor || !view || accessor.componentType !== 5126 || accessor.type !== "VEC3") continue;
      const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const stride = view.byteStride ?? 12;
      for (let i = 0; i < accessor.count; i += 1) {
        const at = start + i * stride;
        values.push([bin.readFloatLE(at), bin.readFloatLE(at + 4), bin.readFloatLE(at + 8)]);
      }
    }
  }
  if (!values.length && dracoPayloads.length) {
    return crypto.createHash("sha256").update(Buffer.concat(dracoPayloads)).digest("hex");
  }
  if (!values.length) return "empty";
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of values) for (let axis = 0; axis < 3; axis += 1) {
    min[axis] = Math.min(min[axis], point[axis]);
    max[axis] = Math.max(max[axis], point[axis]);
  }
  const span = max.map((value, axis) => Math.max(value - min[axis], 1e-6));
  const normalized = values.map((point) => point.map((value, axis) => Math.round(((value - min[axis]) / span[axis]) * 127))).sort((a, b) => a.join(",").localeCompare(b.join(",")));
  const payload = JSON.stringify({ count: values.length, normalized });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function sizeMm(buffer) {
  const { json, bin } = parseGlb(buffer);
  const values = [];
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    const accessor = json.accessors?.[primitive.attributes?.POSITION];
    const view = json.bufferViews?.[accessor?.bufferView];
    if (!accessor || !view || accessor.componentType !== 5126 || accessor.type !== "VEC3") continue;
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const stride = view.byteStride ?? 12;
    for (let i = 0; i < accessor.count; i += 1) {
      const at = start + i * stride;
      values.push([bin.readFloatLE(at), bin.readFloatLE(at + 4), bin.readFloatLE(at + 8)]);
    }
  }
  if (!values.length) return { width: 1, height: 1, depth: 1 };
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of values) for (let axis = 0; axis < 3; axis += 1) {
    min[axis] = Math.min(min[axis], point[axis]);
    max[axis] = Math.max(max[axis], point[axis]);
  }
  return { width: Math.round((max[0] - min[0]) * 1000), height: Math.round((max[1] - min[1]) * 1000), depth: Math.round((max[2] - min[2]) * 1000) };
}

async function loadExtraModels() {
  const importRoot = path.resolve("runtime-assets/_imports/kenney-furniture-kit/extracted");
  const models = [];
  for (const extra of EXTRA_MODELS) {
    const sourcePath = path.join(path.resolve(extra.sourceRoot ?? "runtime-assets/_imports/kenney-furniture-kit/extracted"), extra.sourceRelativePath);
    const targetRelativePath = `${extra.category}/${extra.targetPrefix ?? "kenney-"}${extra.name}.glb`;
    const targetPath = path.join(DATASET_ROOT, targetRelativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
    const buffer = await readFile(targetPath);
    models.push({
      fileName: path.basename(targetRelativePath),
      relativePath: targetRelativePath.replaceAll("\\", "/"),
      category: extra.category,
      catalogCategory: extra.category,
      catalogCategoryLabel: CATEGORY_LABELS[extra.category],
      displayNameKo: extra.displayNameKo,
      sizeMm: sizeMm(buffer),
      license: extra.license ?? "CC0-1.0",
      sourceUrl: extra.sourceUrl ?? "https://kenney.nl/assets/furniture-kit",
      excludedFromCatalog: false,
      geometrySignature: geometrySignature(buffer),
      _extra: true,
    });
  }
  return models;
}

async function curate({ dryRun = false } = {}) {
  const original = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const catalogByPath = new Map((original.items ?? []).map((item) => [String(item.relativePath ?? "").replaceAll("\\", "/"), item]));
  const extras = await loadExtraModels();
  const existing = [];
  for (const manifestItem of manifest.items ?? []) {
    const item = {
      ...manifestItem,
      ...(catalogByPath.get(String(manifestItem.relativePath ?? "").replaceAll("\\", "/")) ?? {}),
    };
    const relativePath = String(item.relativePath ?? "").replaceAll("\\", "/");
    const filePath = path.join(DATASET_ROOT, relativePath);
    try {
      const buffer = await readFile(filePath);
      existing.push({ ...item, relativePath, geometrySignature: geometrySignature(buffer), _extra: false });
    } catch {
      // Do not put broken/missing assets in the visible catalog.
    }
  }

  const candidates = [...existing, ...extras]
    .map((item) => ({ ...item, curatedCategory: item._extra ? item.catalogCategory : classifyName(item) }))
    .filter((item) => item.curatedCategory && CATEGORY_LABELS[item.curatedCategory] && isCategoryRelevant(item, item.curatedCategory) && !isIrrelevant(item, item.curatedCategory));

  const selected = {};
  const rejectedByCategory = {};
  const usedGeometryGlobal = new Set();
  for (const category of Object.keys(CATEGORY_LABELS)) {
    const usedGeometry = new Set();
    rejectedByCategory[category] = [];
    const categoryCandidates = candidates
      .filter((item) => item.curatedCategory === category)
      .sort((a, b) => categoryScore(b, category) - categoryScore(a, category) || a.relativePath.localeCompare(b.relativePath));
    selected[category] = [];
    for (const item of categoryCandidates) {
      if (selected[category].length >= TARGET_COUNT) break;
      if (usedGeometry.has(item.geometrySignature) || usedGeometryGlobal.has(item.geometrySignature)) {
        rejectedByCategory[category].push(item.relativePath);
        continue;
      }
      usedGeometry.add(item.geometrySignature);
      usedGeometryGlobal.add(item.geometrySignature);
      selected[category].push({
        ...item,
        catalogCategory: category,
        catalogCategoryLabel: CATEGORY_LABELS[category],
        displayNameKo: item.displayNameKo || `${CATEGORY_LABELS[category]} 모델`,
        excludedFromCatalog: false,
        geometrySignature: undefined,
        curatedCategory: undefined,
        _extra: undefined,
      });
    }
  }

  const counts = Object.fromEntries(Object.entries(selected).map(([category, items]) => [category, items.length]));
  const short = Object.entries(counts).filter(([, count]) => count < TARGET_COUNT);
  if (short.length) {
    const details = short.map(([category, count]) => `${category}=${count}; candidates=${candidates.filter((item) => item.curatedCategory === category).length}; duplicateExamples=${rejectedByCategory[category].slice(0, 6).join(",")}; candidatePaths=${candidates.filter((item) => item.curatedCategory === category).map((item) => item.relativePath).join(",")}`).join(" | ");
    throw new Error(`Could not reach 50 distinct models: ${details}`);
  }

  const items = Object.values(selected).flat();
  const output = {
    generatedAt: new Date().toISOString(),
    root: original.root,
    format: original.format,
    itemCount: items.length,
    categoryCounts: counts,
    curation: {
      targetPerCategory: TARGET_COUNT,
      distinctGeometryRule: "GLB geometry hash; uncompressed POSITION data is normalized and Draco geometry payloads are hashed, so material/color/image variants are not counted separately",
      removedFromVisibleCatalog: (original.items ?? []).length - items.length,
      extraKenneyModels: extras.filter((item) => items.some((selectedItem) => selectedItem.relativePath === item.relativePath)).length,
    },
    items,
  };
  if (!dryRun) await writeFile(CATALOG_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  return { counts, itemCount: items.length, output };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href) {
  curate({ dryRun: process.argv.includes("--dry-run") })
    .then(({ counts, itemCount }) => console.log(JSON.stringify({ itemCount, counts })))
    .catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
