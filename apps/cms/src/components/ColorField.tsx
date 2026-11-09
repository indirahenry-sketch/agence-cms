'use client'

import { FieldDescription, FieldLabel, useField } from '@payloadcms/ui'
import type { TextFieldClientComponent } from 'payload'
import React from 'react'

const SWATCHES = ['#1F4E79', '#2563EB', '#0F766E', '#16A34A', '#65A30D', '#CA8A04', '#F2C14E', '#EA580C', '#DC2626', '#DB2777', '#7C3AED', '#334155']
const HEX = /^#[0-9a-f]{6}$/i

/** Choix d'une couleur : pastille cliquable (nuancier du système), code #RRGGBB et couleurs rapides. */
export const ColorField: TextFieldClientComponent = ({ field, path, readOnly }) => {
  const { value, setValue, showError, errorMessage } = useField<string>({ path: path || field.name })
  const v = typeof value === 'string' ? value : ''
  const valid = HEX.test(v)
  const label = typeof field.label === 'string' ? field.label : field.name
  return (
    <div className={`field-type color-field${showError ? ' error' : ''}`}>
      <FieldLabel htmlFor={`field-${path}`} label={label} required={field.required} />
      <div className="color-field__row">
        <label className="color-field__swatch" style={{ background: valid ? v : 'transparent' }} title="Choisir une couleur">
          <input type="color" value={valid ? v : '#000000'} disabled={readOnly} onChange={(e) => setValue(e.target.value.toUpperCase())} aria-label={`${label} : nuancier`} />
        </label>
        <input
          id={`field-${path}`}
          className="color-field__hex"
          value={v}
          disabled={readOnly}
          placeholder="#RRGGBB"
          maxLength={7}
          onChange={(e) => {
            const raw = e.target.value.trim()
            setValue(raw && !raw.startsWith('#') ? `#${raw}` : raw)
          }}
        />
      </div>
      {!readOnly && (
        <div className="color-field__presets" role="group" aria-label="Couleurs rapides">
          {SWATCHES.map((c) => (
            <button key={c} type="button" className={v.toUpperCase() === c ? 'on' : ''} style={{ background: c }} onClick={() => setValue(c)} aria-label={c} title={c} />
          ))}
        </div>
      )}
      {showError && errorMessage && <p className="color-field__error">{errorMessage}</p>}
      <FieldDescription description={field.admin?.description} path={path || field.name} />
    </div>
  )
}

export default ColorField
