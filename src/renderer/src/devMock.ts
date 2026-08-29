/**
 * Dev-only in-browser mock of the `window.ck3tools` preload bridge, so the
 * renderer can be previewed in a plain browser tab (where Electron's preload
 * doesn't run). Never active inside the real app: the preload defines
 * `window.ck3tools` before any renderer code executes.
 */
import type { Ck3ToolsApi } from '../../preload/index.d'
import type { AppSettings, CharacterDetail } from '@shared/types'

const settings: AppSettings = {
  gameDir: 'C:\\Mock\\Crusader Kings III\\game',
  modDir: 'C:\\Mock\\mod',
  selectedModFile: 'MockMod.mod',
  recentCharacters: {},
  favoriteCharacters: {},
  textEditorPath: null
}

const characters: CharacterDetail[] = [
  {
    id: '219',
    file: 'mock_characters.txt',
    name: 'Alexios',
    dynasty: 'dynn_Mock',
    birth: '1050.1.1',
    death: null,
    culture: 'greek',
    faith: 'orthodox',
    father: '218',
    mother: null,
    traits: ['brave', 'ambitious'],
    stats: {
      diplomacy: 4,
      martial: 7,
      stewardship: 3,
      intrigue: 5,
      learning: 2,
      prowess: 6
    }
  },
  {
    id: '218',
    file: 'mock_characters.txt',
    name: 'Ioannes',
    dynasty: 'dynn_Mock',
    birth: '1020.1.1',
    death: '1078.4.2',
    culture: 'greek',
    faith: 'orthodox',
    father: null,
    mother: null,
    traits: ['just'],
    stats: {
      diplomacy: 6,
      martial: 3,
      stewardship: 5,
      intrigue: 2,
      learning: 4,
      prowess: 3
    }
  }
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
      pathExists: true
    }
  ],
  listCharacters: async () =>
    characters.map(({ id, name, dynasty, birth, file }) => ({ id, name, dynasty, birth, file })),
  getCharacter: async (_modPath, file, id) =>
    structuredClone(characters.find((c) => c.file === file && c.id === id) ?? null),
  saveCharacter: async () => ({ ok: true }),
  getTraitIcons: async (_g, _m, _r, traits) =>
    Object.fromEntries(traits.map((t) => [t, null])),
  getReferenceData: async () => ({
    cultures: ['greek', 'norse', 'saxon'],
    faiths: ['orthodox', 'catholic', 'asatru'],
    traits: ['brave', 'ambitious', 'craven', 'shy'],
    dynasties: ['dynn_Mock', 'dynn_Other', 'house_Mockington']
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
