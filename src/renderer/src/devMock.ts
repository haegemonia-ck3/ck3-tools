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
  DynastyCharacter,
  DynastyDef,
  HouseDef,
  RefEntry
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
    faith: 'asatru',
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
