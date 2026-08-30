/**
 * Dev-only in-browser mock of the `window.ck3tools` preload bridge, so the
 * renderer can be previewed in a plain browser tab (where Electron's preload
 * doesn't run). Never active inside the real app: the preload defines
 * `window.ck3tools` before any renderer code executes.
 */
import type { Ck3ToolsApi } from '../../preload/index.d'
import type {
  AppSettings,
  CharacterDetail,
  CultureCharacter,
  CultureDef,
  DynastyCharacter,
  DynastyDef,
  FaithDef,
  HouseDef,
  RefEntry,
  ReligionDef
} from '@shared/types'

/** `{ id: name }` as reference entries; a null name means "no localization". */
const named = (entries: Record<string, string | null>): RefEntry[] =>
  Object.entries(entries).map(([id, name]) => ({ id, name }))

const settings: AppSettings = {
  gameDir: 'C:\\Mock\\Crusader Kings III\\game',
  modDir: 'C:\\Mock\\mod',
  selectedModFile: 'MockMod.mod',
  recentCharacters: {},
  favoriteCharacters: {},
  draftCharacters: {},
  textEditorPath: null
}

const characters: CharacterDetail[] = [
  {
    id: '219',
    file: 'mock_characters.txt',
    name: 'Alexios',
    dynasty: 'dynn_Mock',
    house: null,
    birth: '1050.1.1',
    death: null,
    culture: 'greek',
    faith: 'orthodox',
    father: '218',
    mother: null,
    traits: ['brave', 'ambitious'],
    spouses: [{ id: '1002', marriage: '1070.3.4', divorce: null, matrilineal: false }],
    stats: {
      diplomacy: 4,
      martial: 7,
      stewardship: 3,
      intrigue: 5,
      learning: 2,
      prowess: 6
    },
    female: null,
    sexuality: null,
    dna: null
  },
  {
    id: '218',
    file: 'mock_characters.txt',
    name: 'Ioannes',
    dynasty: 'dynn_Mock',
    house: null,
    birth: '1020.1.1',
    death: '1078.4.2',
    culture: 'greek',
    faith: 'orthodox',
    father: null,
    mother: null,
    traits: ['just'],
    spouses: [],
    stats: {
      diplomacy: 6,
      martial: 3,
      stewardship: 5,
      intrigue: 2,
      learning: 4,
      prowess: 3
    },
    female: null,
    sexuality: null,
    dna: null
  },
  {
    id: '1002',
    file: 'mock_characters.txt',
    name: 'Eirene',
    dynasty: 'dynn_Mock',
    house: null,
    birth: '1052.6.3',
    death: '1099.2.14',
    culture: 'greek',
    faith: 'orthodox',
    father: null,
    mother: null,
    traits: ['shy'],
    spouses: [],
    stats: {
      diplomacy: 6,
      martial: 2,
      stewardship: 7,
      intrigue: 3,
      learning: 5,
      prowess: 1
    },
    female: 'yes',
    sexuality: null,
    dna: null
  },
  {
    id: '77',
    file: 'mock_characters.txt',
    name: null,
    dynasty: null,
    house: null,
    birth: '1041.11.2',
    death: null,
    culture: 'greek',
    faith: 'orthodox',
    father: null,
    mother: null,
    traits: [],
    spouses: [],
    stats: {
      diplomacy: null,
      martial: null,
      stewardship: null,
      intrigue: null,
      learning: null,
      prowess: null
    },
    female: null,
    sexuality: null,
    dna: null
  },
  {
    id: '3410',
    file: 'mock_norse.txt',
    name: 'Ragnvald',
    dynasty: 'dynn_Other',
    house: null,
    birth: '1044.3.20',
    death: null,
    culture: 'norse',
    faith: 'asatru',
    father: null,
    mother: null,
    traits: ['brave'],
    spouses: [],
    stats: {
      diplomacy: 2,
      martial: 9,
      stewardship: 1,
      intrigue: 4,
      learning: 1,
      prowess: 8
    },
    female: null,
    sexuality: null,
    dna: null
  },
  {
    id: '3411',
    file: 'mock_norse.txt',
    name: 'Astrid',
    // The house-only case: no `dynasty =` line, lineage comes via the house
    dynasty: null,
    house: 'house_Mockington',
    birth: '1048.9.9',
    death: null,
    culture: 'norse',
    faith: 'lost_faith',
    father: null,
    mother: null,
    traits: ['ambitious', 'craven'],
    spouses: [],
    stats: {
      diplomacy: 5,
      martial: 3,
      stewardship: 6,
      intrigue: 8,
      learning: 4,
      prowess: 2
    },
    female: 'yes',
    sexuality: null,
    dna: null
  }
]

// Synthetic dynasty data shaped like real mod files: disconnected islands
// centuries apart, cadet houses, a case-mismatched parent ref, a dangling
// house, external (ghost) parents, and a game-defined dynasty in use.
const cultures: CultureDef[] = [
  {
    id: 'greek',
    file: '00_mock_cultures.txt',
    inMod: true,
    localizedName: 'Greek',
    color: { format: 'rgb', raw: 'rgb { 20 85 150 }', hex: '#145596' },
    ethos: 'ethos_bellicose',
    heritage: 'heritage_hellenic',
    language: 'language_greek',
    martialCustom: 'martial_custom_male_only',
    headDetermination: null,
    traditions: ['tradition_philosopher_culture', 'tradition_seafaring'],
    nameList: 'name_list_greek',
    parents: [],
    created: null,
    coaGfx: ['greek_coa_gfx'],
    buildingGfx: ['mediterranean_building_gfx'],
    clothingGfx: ['greek_clothing_gfx'],
    unitGfx: ['eastern_unit_gfx'],
    houseCoaFrame: 'house_frame_05',
    ethnicities: [{ weight: '10', id: 'mediterranean' }]
  },
  {
    id: 'attic',
    file: '00_mock_cultures.txt',
    inMod: true,
    localizedName: 'Attic',
    color: { format: 'hsv', raw: 'hsv { 0.1 0.6 0.8 }', hex: '#cc8f29' },
    ethos: 'ethos_stoic',
    heritage: 'heritage_hellenic',
    language: 'language_greek',
    martialCustom: 'martial_custom_male_only',
    headDetermination: 'head_determination_domain',
    traditions: ['tradition_philosopher_culture'],
    nameList: 'name_list_greek',
    // Points at greek, so the relations panel has a lineage to draw
    parents: ['greek'],
    created: '1050.1.1',
    coaGfx: ['greek_coa_gfx'],
    buildingGfx: ['mediterranean_building_gfx'],
    clothingGfx: ['greek_clothing_gfx'],
    unitGfx: ['eastern_unit_gfx'],
    houseCoaFrame: 'house_frame_05',
    ethnicities: [
      { weight: '10', id: 'mediterranean' },
      { weight: '2', id: 'levantine' }
    ]
  },
  {
    id: 'norse',
    file: '00_mock_cultures.txt',
    inMod: true,
    // No localization and no colour: the bare-id and empty-swatch fallbacks
    localizedName: null,
    color: null,
    ethos: 'ethos_bellicose',
    heritage: 'heritage_north_germanic',
    language: null,
    martialCustom: null,
    headDetermination: null,
    traditions: [],
    nameList: null,
    parents: ['nonexistent_culture'],
    created: null,
    coaGfx: [],
    buildingGfx: [],
    clothingGfx: [],
    unitGfx: [],
    houseCoaFrame: null,
    ethnicities: []
  },
  {
    id: 'saxon',
    file: '01_game_cultures.txt',
    inMod: false,
    localizedName: 'Saxon',
    color: { format: 'named', raw: 'english', hex: '#cc3333' },
    ethos: 'ethos_communal',
    heritage: 'heritage_west_germanic',
    language: 'language_anglic',
    martialCustom: 'martial_custom_male_only',
    headDetermination: null,
    traditions: ['tradition_hill_dwellers'],
    nameList: 'name_list_saxon',
    parents: [],
    created: null,
    coaGfx: ['western_coa_gfx'],
    buildingGfx: ['western_building_gfx'],
    clothingGfx: ['western_clothing_gfx'],
    unitGfx: ['western_unit_gfx'],
    houseCoaFrame: 'house_frame_22',
    ethnicities: [{ weight: '100', id: 'caucasian_nordic' }]
  }
]

const dynasties: DynastyDef[] = [
  {
    id: 'mockidae',
    file: '00_dynasties.txt',
    inMod: true,
    name: 'dynn_Mockidae',
    prefix: null,
    motto: 'dynn_Mockidae_motto',
    culture: 'greek',
    localizedName: 'Mockidai'
  },
  {
    id: '7',
    file: '00_dynasties.txt',
    inMod: true,
    name: 'dynn_Heraclid',
    prefix: 'dynnp_of',
    motto: null,
    culture: 'greek',
    localizedName: 'Heraclids'
  },
  {
    id: 'vanity_game',
    file: '01_vanity_dynasties.txt',
    inMod: false,
    name: 'dynn_Gamefolk',
    prefix: null,
    motto: null,
    culture: 'saxon',
    localizedName: 'Gamefolk'
  }
]

const houses: HouseDef[] = [
  {
    id: 'house_Alpha',
    file: '00_dynasty_houses.txt',
    inMod: true,
    name: 'dynn_Alpha',
    prefix: null,
    motto: 'dynn_Alpha_motto',
    dynasty: 'mockidae',
    localizedName: 'Alphaids'
  },
  {
    id: 'house_Beta',
    file: '00_dynasty_houses.txt',
    inMod: true,
    name: 'dynn_Beta',
    prefix: null,
    motto: null,
    // Case mismatch on purpose — real mods reference `Phokus` as `phokus`
    dynasty: 'Mockidae',
    localizedName: null
  }
]

const dc = (partial: Partial<DynastyCharacter> & { id: string }): DynastyCharacter => ({
  file: 'mock_dynasty.txt',
  name: null,
  birth: null,
  death: null,
  father: null,
  mother: null,
  female: false,
  dynasty: null,
  house: null,
  spouses: [],
  ...partial
})

const dynastyCharacters: DynastyCharacter[] = [
  // Island 1: the founder era
  dc({ id: 'M1', name: 'Mockos', dynasty: 'mockidae', birth: '2669.1.1', death: '2716.1.1' }),
  dc({
    id: 'M2',
    name: 'Nestor',
    dynasty: 'mockidae',
    father: 'M1',
    birth: '2691.1.1',
    death: '2779.1.1',
    spouses: ['E1']
  }),
  dc({ id: 'M3', name: 'Antilochus', dynasty: 'mockidae', father: 'M2', birth: '2728.1.1.', death: '2757.1.1' }),
  dc({ id: 'M4', name: 'Thrasymedes', dynasty: 'mockidae', father: 'M2', birth: '2735.1', death: '2807.1.1' }),
  dc({ id: 'M5', name: 'Peryclemus', dynasty: 'mockidae', father: 'M2', birth: '2739.1.1', death: '2788.1.1' }),
  dc({ id: 'M6', name: 'Polycaste', dynasty: 'mockidae', father: 'M2', female: true, birth: '2741.1.1' }),
  // Island 2: 257+ years later, no parent chain back to island 1
  dc({ id: 'M10', name: 'Neomockos', dynasty: 'mockidae', birth: '3040.1.1', death: '3101.1.1' }),
  dc({
    id: 'M11',
    name: 'Alphaion',
    house: 'house_Alpha',
    father: 'M10',
    birth: '3067.1.1',
    death: '3130.1.1',
    spouses: ['O1']
  }),
  dc({
    id: 'M12',
    name: 'Alphaides',
    house: 'house_Alpha',
    father: 'M11',
    mother: 'O1',
    birth: '3095.1.1'
  }),
  dc({ id: 'B1', name: 'Betaion', house: 'house_Beta', father: 'X7', birth: '3070.1.1', death: '3141.1.1' }),
  dc({ id: 'B2', name: 'Betaides', house: 'house_Beta', father: 'B1', birth: '3103.1.1' }),
  // Members of a house that is defined nowhere (dangling ref)
  dc({ id: 'G1', name: 'Ghostly', house: 'house_ghostly', birth: '3075.1.1', death: '3129.1.1' }),
  // External context characters (ghost parents / spouses)
  dc({ id: 'X7', name: 'Herakles', dynasty: '7', birth: '3041.1.1', death: '3099.1.1' }),
  dc({ id: 'O1', name: 'Omphale', dynasty: '7', female: true, birth: '3072.1.1' }),
  dc({ id: 'E1', name: 'Eurydike', dynasty: 'vanity_game', female: true, birth: '2695.1.1', death: '2760.1.1' }),
  dc({ id: 'L1', name: 'Lowborn Larry', birth: '3050.1.1' })
]


// ---------- Religions & faiths ----------

const religions: ReligionDef[] = [
  {
    id: 'christianity_religion',
    file: 'mock_christian.txt',
    inMod: false,
    family: 'rf_abrahamic',
    graphicalFaith: 'catholic_gfx',
    pietyIconGroup: null,
    doctrines: ['doctrine_spiritual_head', 'doctrine_monogamy'],
    localizedName: 'Christianity'
  },
  {
    id: 'hellenism_religion',
    file: 'mock_hellenic.txt',
    inMod: true,
    family: 'rf_pagan',
    graphicalFaith: 'pagan_gfx',
    pietyIconGroup: 'pagan',
    doctrines: ['doctrine_no_head', 'doctrine_monogamy'],
    localizedName: 'Hellenism'
  },
  {
    id: 'germanic_religion',
    file: 'mock_germanic.txt',
    inMod: true,
    family: 'rf_pagan',
    graphicalFaith: 'pagan_gfx',
    pietyIconGroup: null,
    doctrines: ['doctrine_no_head'],
    localizedName: null
  }
]

const faith = (
  id: string,
  religion: string,
  file: string,
  over: Partial<FaithDef> = {}
): FaithDef => ({
  id,
  file,
  inMod: file !== 'mock_christian.txt',
  religion,
  color: { hex: '#8a5a3c', raw: '{ 0.54 0.35 0.24 }', editable: true },
  icon: null,
  reformedIcon: null,
  religiousHead: null,
  doctrines: [],
  holySites: [],
  localizedName: null,
  ...over
})

const faiths: FaithDef[] = [
  faith('orthodox', 'christianity_religion', 'mock_christian.txt', {
    // A named-colour reference: shown with its swatch, but not rewritable
    color: { hex: '#6a4fbb', raw: 'mock_purple', editable: false },
    icon: 'orthodox',
    religiousHead: 'k_orthodox',
    doctrines: ['tenet_communion', 'doctrine_spiritual_head'],
    holySites: ['mock_jerusalem'],
    localizedName: 'Orthodoxy'
  }),
  faith('catholic', 'christianity_religion', 'mock_christian.txt', {
    color: { hex: '#b9a24a', raw: '{ 0.73 0.64 0.29 }', editable: true },
    icon: 'orthodox',
    localizedName: 'Catholicism'
  }),
  faith('olympian', 'hellenism_religion', 'mock_hellenic.txt', {
    color: { hex: '#a3312a', raw: '{ 0.64 0.19 0.16 }', editable: true },
    icon: 'hellenic',
    doctrines: ['tenet_hero_cult', 'tenet_astrology', 'doctrine_no_head'],
    holySites: ['mock_delphi', 'mock_olympia'],
    localizedName: 'Olympian'
  }),
  // No localization, and no adherents yet: a faith mid-authoring
  faith('delian', 'hellenism_religion', 'mock_hellenic.txt', {
    color: { hex: '#1f96af', raw: '{ 31 150 175 }', editable: true },
    icon: 'delos_palm',
    reformedIcon: 'hellenic_reformed',
    religiousHead: 'd_mock_delos',
    doctrines: ['tenet_adaptive', 'tenet_hero_cult'],
    holySites: ['mock_delphi']
  }),
  faith('asatru', 'germanic_religion', 'mock_germanic.txt', {
    // No colour line at all
    color: null,
    doctrines: ['tenet_adaptive'],
    localizedName: null
  })
]

const mock: Ck3ToolsApi = {
  getSettings: async () => structuredClone(settings),
  setSettings: async (patch) => Object.assign(settings, patch) && structuredClone(settings),
  detectPaths: async () => ({ gameDir: settings.gameDir, modDir: settings.modDir }),
  listMods: async () => [
    {
      file: 'MockMod.mod',
      name: 'Mock Mod',
      version: '1.0',
      supportedVersion: '1.13.*',
      tags: ['Total Conversion'],
      path: 'C:\\Mock\\mod\\MockMod',
      replacePaths: [],
      pathExists: true,
      profile: { calendar: { epochYear: 4000, beforeLabel: 'BC', afterLabel: 'AD' } }
    }
  ],
  listCharacters: async () =>
    characters.map(({ id, name, dynasty, birth, father, mother, file }) => ({
      id,
      name,
      dynasty,
      birth,
      father,
      mother,
      file
    })),
  getCharacter: async (_modPath, file, id) =>
    structuredClone(characters.find((c) => c.file === file && c.id === id) ?? null),
  saveCharacter: async (_modPath, file, originalId, detail) => {
    const i = characters.findIndex((c) => c.file === file && c.id === originalId)
    if (i >= 0) characters[i] = structuredClone(detail)
    return { ok: true }
  },
  listCharacterFiles: async () => [...new Set(characters.map((c) => c.file))].sort(),
  getDnaPasteInfo: async (_modPath, _file, id) => ({
    dnaKey: `${id}_dna`,
    dnaFiles: ['00_mock_dna.txt'],
    modifierFiles: ['mock_scripted_appearances.txt'],
    lockedDnaFile: null,
    lockedModifierFile: null
  }),
  applyRulerDesignerDna: async (_g, _modPath, _r, file, id, _paste, dnaFile) => {
    const c = characters.find((x) => x.file === file && x.id === id)
    if (!c) return { ok: false, error: `Character ${id} not found in ${file}` }
    c.dna = `${id}_dna`
    console.info(`[devMock] applyRulerDesignerDna → ${dnaFile}`)
    return { ok: true }
  },
  createCharacter: async (_modPath, file, detail) => {
    if (characters.some((c) => c.id === detail.id)) {
      return { ok: false, error: `ID ${detail.id} already exists in the mod` }
    }
    characters.push(structuredClone({ ...detail, file }))
    return { ok: true }
  },
  getCultureData: async () => ({
    cultures: structuredClone(cultures),
    pillars: {
      ethos: named({ ethos_bellicose: 'Bellicose', ethos_stoic: 'Stoic', ethos_communal: 'Communal' }),
      heritage: named({
        heritage_hellenic: 'Hellenic',
        heritage_north_germanic: 'North Germanic',
        heritage_west_germanic: null
      }),
      language: named({ language_greek: 'Greek', language_anglic: 'Anglic' }),
      martial_custom: named({ martial_custom_male_only: 'Men Only' }),
      head_determination: named({ head_determination_domain: 'Determine by largest domain' })
    },
    traditions: [
      { id: 'tradition_philosopher_culture', name: 'Philosopher Culture', category: 'societal' },
      { id: 'tradition_seafaring', name: 'Seafaring', category: 'regional' },
      { id: 'tradition_hill_dwellers', name: 'Hill Dwellers', category: 'regional' },
      { id: 'tradition_unnamed', name: null, category: null }
    ],
    nameLists: named({ name_list_greek: 'Greek', name_list_saxon: 'Saxon' }),
    ethnicities: named({ mediterranean: null, levantine: null, caucasian_nordic: null }),
    gfx: {
      coa: ['greek_coa_gfx', 'western_coa_gfx'],
      building: ['mediterranean_building_gfx', 'western_building_gfx'],
      clothing: ['greek_clothing_gfx', 'western_clothing_gfx'],
      unit: ['eastern_unit_gfx', 'western_unit_gfx'],
      houseCoaFrame: ['house_frame_05', 'house_frame_22']
    },
    characters: characters.map(
      (c): CultureCharacter => ({
        id: c.id,
        file: c.file,
        name: c.name,
        birth: c.birth,
        death: c.death,
        culture: c.culture
      })
    )
  }),
  saveCulture: async (_g, _modPath, _r, file, id, patch) => {
    const c = cultures.find((x) => x.file === file && x.id === id)
    if (!c) return { ok: false, error: `Culture ${id} not found in ${file}` }
    Object.assign(c, patch, {
      color: patch.color === null ? null : { ...(c.color ?? { format: 'rgb' as const, raw: '' }), hex: patch.color }
    })
    return { ok: true }
  },
  getDynastyData: async () => ({
    dynasties: structuredClone(dynasties),
    houses: structuredClone(houses),
    characters: structuredClone(dynastyCharacters)
  }),
  saveDynasty: async (_modPath, file, id, patch) => {
    const d = dynasties.find((x) => x.file === file && x.id === id)
    if (!d) return { ok: false, error: `Dynasty ${id} not found in ${file}` }
    Object.assign(d, patch)
    return { ok: true }
  },
  saveHouse: async (_modPath, file, id, patch) => {
    const h = houses.find((x) => x.file === file && x.id === id)
    if (!h) return { ok: false, error: `House ${id} not found in ${file}` }
    Object.assign(h, patch)
    return { ok: true }
  },
  listDynastyFiles: async () => ({
    dynasties: [...new Set(dynasties.filter((d) => d.inMod).map((d) => d.file))].sort(),
    houses: [...new Set(houses.filter((h) => h.inMod).map((h) => h.file))].sort()
  }),
  createDynasty: async (_modPath, file, def) => {
    const taken = [...dynasties, ...houses].find((x) => x.id.toLowerCase() === def.id.toLowerCase())
    if (taken) return { ok: false, error: `ID ${def.id} already exists in ${taken.file}` }
    dynasties.push({ ...def, file, inMod: true, localizedName: null })
    return { ok: true }
  },
  createHouse: async (_modPath, file, def) => {
    const taken = [...dynasties, ...houses].find((x) => x.id.toLowerCase() === def.id.toLowerCase())
    if (taken) return { ok: false, error: `ID ${def.id} already exists in ${taken.file}` }
    houses.push({ ...def, file, inMod: true, localizedName: null })
    return { ok: true }
  },
  getReligionData: async () => ({
    religions: structuredClone(religions),
    faiths: structuredClone(faiths),
    groups: [
      {
        id: 'doctrine_head_of_faith',
        category: 'main_group',
        picks: 1,
        name: 'Head of Faith',
        doctrines: named({
          doctrine_no_head: 'No Head of Faith',
          doctrine_spiritual_head: 'Spiritual Head of Faith',
          doctrine_temporal_head: null
        })
      },
      {
        id: 'doctrine_marriage_type',
        category: 'marriage',
        picks: 1,
        name: 'Marriage Type',
        doctrines: named({ doctrine_monogamy: 'Monogamous', doctrine_polygamy: 'Polygamous' })
      },
      {
        id: 'doctrine_core_tenets',
        category: 'core_tenets',
        picks: 3,
        name: 'Core Tenets',
        doctrines: named({
          tenet_hero_cult: 'Hero Cult',
          tenet_astrology: 'Astrology',
          tenet_adaptive: 'Adaptive',
          tenet_communion: 'Communion',
          tenet_unnamed: null
        })
      }
    ],
    ungroupedDoctrines: named({ special_doctrine_mock: null }),
    holySites: named({
      mock_delphi: 'Delphi',
      mock_olympia: 'Olympia',
      mock_jerusalem: 'Jerusalem',
      mock_unnamed: null
    }),
    families: named({ rf_pagan: 'Pagan', rf_abrahamic: 'Abrahamic', rf_mock: null }),
    adherents: characters
      .filter((c) => c.faith !== null)
      .map((c) => ({ id: c.id, file: c.file, name: c.name, faith: c.faith as string }))
  }),
  saveFaith: async (_modPath, file, _religionId, faithId, patch) => {
    const f = faiths.find((x) => x.file === file && x.id === faithId)
    if (!f) return { ok: false, error: `Faith ${faithId} not found in ${file}` }
    Object.assign(f, {
      icon: patch.icon,
      reformedIcon: patch.reformedIcon,
      religiousHead: patch.religiousHead,
      doctrines: patch.doctrines,
      holySites: patch.holySites,
      color: f.color && patch.color ? { ...f.color, hex: patch.color } : f.color
    })
    return { ok: true }
  },
  saveReligion: async (_modPath, file, religionId, patch) => {
    const r = religions.find((x) => x.file === file && x.id === religionId)
    if (!r) return { ok: false, error: `Religion ${religionId} not found in ${file}` }
    Object.assign(r, patch)
    return { ok: true }
  },
  getFaithIcons: async (_g, _m, _r, icons) => Object.fromEntries(icons.map((i) => [i, null])),
  listFaithIcons: async () => ['delos_palm', 'hellenic', 'hellenic_reformed', 'orthodox'],
  getTraitIcons: async (_g, _m, _r, traits) =>
    Object.fromEntries(traits.map((t) => [t, null])),
  // Initial-letter stand-ins for the game's silhouettes: opaque black on
  // transparent like the real .dds files, so the mask tinting is exercised in
  // browser-mode dev. Real icons need Electron (game files + main process).
  getFlatIcons: async (_g, _m, _r, names) =>
    Object.fromEntries(
      names.map((n) => [
        n,
        'data:image/svg+xml,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
              '<text x="8" y="13" text-anchor="middle" font-size="14"' +
              ' font-family="sans-serif" fill="#000">' +
              n[0].toUpperCase() +
              '</text></svg>'
          )
      ])
    ),
  getSkillIcons: async (_g, _m, _r, skills) =>
    Object.fromEntries(skills.map((s) => [s, null])),
  // A quartered stand-in so browser-mode dev shows the layout; real rendering
  // needs Electron (game files + main process). Only some ids get one, so the
  // "no coat of arms" placeholder is reachable here too.
  getCoatsOfArms: async (_g, _m, _r, ids) =>
    Object.fromEntries(
      ids.map((id) => [
        id,
        !['mockidae', 'house_Alpha', 'dynn_Mock'].includes(id)
          ? null
          : 'data:image/svg+xml,' +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2">' +
                '<rect width="2" height="2" fill="#883333"/>' +
                '<rect width="1" height="1" fill="#ccc2a8"/>' +
                '<rect x="1" y="1" width="1" height="1" fill="#ccc2a8"/></svg>'
            )
      ])
    ),
  // A couple of entries per kind are deliberately name-less, so the bare-id
  // fallback in the reference pickers is reachable in browser-mode dev too.
  getReferenceData: async () => ({
    cultures: named({ greek: 'Greek', norse: 'Norse', saxon: null }),
    faiths: named({ orthodox: 'Orthodoxy', catholic: 'Catholicism', asatru: null }),
    traits: named({ brave: 'Brave', ambitious: 'Ambitious', craven: 'Craven', shy: null }),
    dynasties: named({ dynn_Mock: 'Mockidae', dynn_Other: null }),
    houses: named({ house_Mockington: 'Mockington', house_Other: null }),
    dnas: named({ '163112_halfdan_whiteshirt': null, mock_dna: null })
  }),
  locateRef: async (_g, _m, _r, kind, id) =>
    id.includes('missing')
      ? null
      : { path: `C:\\Mock\\common\\${kind}\\00_${kind}.txt`, line: 42, inMod: true },
  validateGameDir: async () => ({ valid: true, reason: null }),
  validateModDir: async () => ({ valid: true, reason: null }),
  detectEditors: async () => [
    { name: 'Notepad', path: 'C:\\Windows\\notepad.exe' },
    { name: 'VS Code', path: 'C:\\Mock\\Code.exe' }
  ],
  openInEditor: async (file, line) => {
    console.info(`[devMock] openInEditor(${file}, ${line})`)
    return { ok: true }
  },
  pickDirectory: async () => null,
  pickEditor: async () => null
}

export function installDevMock(): void {
  window.ck3tools = mock
  console.info('[devMock] window.ck3tools mock installed (browser preview)')
}
