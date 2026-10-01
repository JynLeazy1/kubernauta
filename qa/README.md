# QA

Tests E2E con Playwright. La estrategia completa está en el plan de migración, en la sección "Estrategia de tests para la migración".

## Línea base de la migración

Protege el contenido mientras cambia la arquitectura (framework mode, Tailwind/shadcn, MDX).

| Archivo                 | Qué revisa                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fixtures/routes.json`  | Inventario congelado de rutas: 195 rutas (home, posts, series, capítulos y partes)                                                                              |
| `tests/routes.spec.ts`  | Cada ruta muestra un `h1`. Las partes sin contenido muestran "Próximamente". Los enlaces internos llevan a una ruta conocida o a un archivo estático que existe |
| `tests/content.spec.ts` | El texto de cada página con contenido, en es y en, es igual al de `baseline/`                                                                                   |

```bash
npm run test:baseline          # rutas + contenido, solo Chromium (~3 min)
npm run test:baseline:update   # regenera baseline/ (solo en PRs content:)
npm run qa:routes              # regenera routes.json (solo al agregar o quitar contenido)
```

### Reglas

- En un PR de migración (`refactor:`, `feat:`, `chore:`), un cambio en `baseline/` es un bug: no se actualizan snapshots.
- `baseline/` solo se actualiza en PRs `content:`. El diff de esos archivos es lo que se revisa.
- Los selectores usan roles y nombres accesibles, nunca clases CSS.
- El idioma se cambia solo con `openInLang` (`helpers/index.ts`). Cuando el idioma pase a la URL (`/en/...`), solo cambia ese helper.
- Fecha y zona horaria están fijas en `playwright.config.js` (`es-MX`, `UTC`) para que los snapshots salgan iguales en local y en CI.
