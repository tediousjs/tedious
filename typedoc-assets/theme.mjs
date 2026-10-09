import { JSX } from 'typedoc';

const LEGACY_DOCS = 'https://web.archive.org/web/20261007205341/https://tediousjs.github.io/tedious/';

export function load(app) {
  app.renderer.hooks.on('footer.end', () =>
    JSX.createElement('p', { class: 'tsd-legacy-docs' },
      JSX.createElement('a', { href: LEGACY_DOCS }, 'View legacy docs')
    )
  );
}
