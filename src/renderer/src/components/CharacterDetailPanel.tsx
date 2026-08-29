import { useEffect, useState } from 'react'
import type { CharacterDetail, ReferenceData } from '@shared/types'
import { STAT_LABELS } from '../statLabels'
import { useTraitIcons } from '../useTraitIcons'
import type { IconContext } from '../useTraitIcons'
import TraitPicker from './TraitPicker'

interface Props {
  modPath: string
  file: string
  id: string
  gameDir: string | null
  replacePaths: string[]
  refData: ReferenceData | null
  /** Called after a successful save; newId may differ from the selected id */
  onSaved: (file: string, newId: string) => void
  onClose: () => void
}

const DATE_RE = /^\d+\.\d+(\.\d+)?$/

export default function CharacterDetailPanel({
  modPath,
  file,
  id,
  gameDir,
  replacePaths,
  refData,
  onSaved,
  onClose
}: Props): React.JSX.Element {
  const [original, setOriginal] = useState<CharacterDetail | null>(null)
  const [draft, setDraft] = useState<CharacterDetail | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    setOriginal(null)
    setDraft(null)
    setError(null)
    window.ck3tools.getCharacter(modPath, file, id).then((d) => {
      setOriginal(d)
      setDraft(d ? structuredClone(d) : null)
    })
  }, [modPath, file, id])

  const iconCtx: IconContext = { gameDir, modPath, replacePaths }
  const iconFor = useTraitIcons(iconCtx, draft?.traits ?? [])

  if (!draft || !original) {
    return (
      <aside className="detail-panel">
        <div className="detail-header">
          <h2>Character</h2>
          <button className="btn btn-small" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="hint">{original === null ? 'Loading…' : 'Character not found.'}</p>
      </aside>
    )
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const set = (patch: Partial<CharacterDetail>): void => {
    setDraft({ ...draft, ...patch })
    setSavedFlash(false)
  }

  const badBirth = draft.birth !== null && draft.birth !== '' && !DATE_RE.test(draft.birth)
  const badDeath = draft.death !== null && draft.death !== '' && !DATE_RE.test(draft.death)

  const addTrait = (value: string): void => {
    const t = value.trim()
    if (t && !draft.traits.includes(t)) {
      set({ traits: [...draft.traits, t] })
    }
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const toSave: CharacterDetail = {
        ...draft,
        birth: draft.birth || null,
        death: draft.death || null
      }
      const result = await window.ck3tools.saveCharacter(modPath, file, original.id, toSave)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOriginal(structuredClone(toSave))
      setDraft(toSave)
      setSavedFlash(true)
      onSaved(file, toSave.id)
    } finally {
      setSaving(false)
    }
  }

  const textField = (
    label: string,
    value: string | null,
    onChange: (v: string | null) => void,
    opts: { listId?: string; invalid?: boolean; placeholder?: string } = {}
  ): React.JSX.Element => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className={`field-input ${opts.invalid ? 'invalid' : ''}`}
        type="text"
        list={opts.listId}
        value={value ?? ''}
        placeholder={opts.placeholder}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      />
    </label>
  )

  return (
    <aside className="detail-panel">
      <div className="detail-header">
        <h2>
          {original.name ?? original.id}
          {dirty && <span className="dirty-dot" title="Unsaved changes" />}
        </h2>
        <button className="btn btn-small" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="detail-body">
        {textField('ID', draft.id, (v) => set({ id: v ?? '' }))}
        {textField('Name', draft.name, (v) => set({ name: v }))}
        {textField('Dynasty', draft.dynasty, (v) => set({ dynasty: v }))}
        <div className="field-row">
          {textField('Birth', draft.birth, (v) => set({ birth: v }), {
            invalid: badBirth,
            placeholder: 'Y.M.D'
          })}
          {textField('Death', draft.death, (v) => set({ death: v }), {
            invalid: badDeath,
            placeholder: 'alive'
          })}
        </div>
        {textField('Culture', draft.culture, (v) => set({ culture: v }), { listId: 'dl-cultures' })}
        {textField('Faith', draft.faith, (v) => set({ faith: v }), { listId: 'dl-faiths' })}

        <div className="field">
          <span className="field-label">Traits</span>
          <div className="trait-chips">
            {draft.traits.map((t) => {
              const icon = iconFor(t)
              return (
                <span key={t} className="chip">
                  {icon && <img className="trait-icon" src={icon} alt="" />}
                  {t}
                  <button
                    className="chip-x"
                    title={`Remove ${t}`}
                    onClick={() => set({ traits: draft.traits.filter((x) => x !== t) })}
                  >
                    ×
                  </button>
                </span>
              )
            })}
            {draft.traits.length === 0 && <span className="dim">none</span>}
          </div>
          <TraitPicker
            available={refData?.traits ?? []}
            exclude={draft.traits}
            iconCtx={iconCtx}
            onAdd={addTrait}
          />
        </div>

        <div className="field">
          <span className="field-label">Stats</span>
          <div className="stats-grid">
            {STAT_LABELS.map(([key, label]) => (
              <label key={key} className="stat-field">
                <span>{label}</span>
                <input
                  className="field-input"
                  type="number"
                  value={draft.stats[key] ?? ''}
                  placeholder="—"
                  onChange={(e) =>
                    set({
                      stats: {
                        ...draft.stats,
                        [key]: e.target.value === '' ? null : Number(e.target.value)
                      }
                    })
                  }
                />
              </label>
            ))}
          </div>
        </div>

        {error && <div className="save-error">{error}</div>}
      </div>

      <div className="detail-footer">
        {savedFlash && !dirty && <span className="saved-note">Saved ✓</span>}
        <button
          className="btn"
          disabled={!dirty || saving}
          onClick={() => {
            setDraft(structuredClone(original))
            setError(null)
          }}
        >
          Revert
        </button>
        <button
          className="btn btn-primary"
          disabled={!dirty || saving || badBirth || badDeath || !draft.id.trim()}
          onClick={save}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {refData && (
        <>
          <datalist id="dl-cultures">
            {refData.cultures.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <datalist id="dl-faiths">
            {refData.faiths.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </>
      )}
    </aside>
  )
}
