import type { SoundSettings } from '@snake/shared/site-config';
import { api, ApiError } from '../api';
import { h, card, field, select, toggle, toast } from '../ui';
import { t } from '../i18n';
import { settingsPage } from './common';
import { loadSettings } from '../state';
import { Sound } from '../../game/audio';

const AUDIO_EXT: Record<string, string> = { mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac' };

export async function render(root: HTMLElement): Promise<() => void> {
  let player: Sound | null = null;
  const stopPlayer = () => {
    player?.stop();
    player = null;
  };

  await settingsPage(root, 'sound', t('soundTitle'), (snd, { changed, redraw }) => {
    const set = <K extends keyof SoundSettings>(k: K, v: SoundSettings[K]) => {
      snd[k] = v;
      changed();
    };
    const range = (value: number, onInput: (v: number) => void) => {
      const r = h('input', { type: 'range', min: 0, max: 1, step: 0.05, class: 'range' });
      r.value = String(value);
      r.addEventListener('input', () => onInput(Number(r.value)));
      return r;
    };

    const ensurePlayer = () => {
      if (!player) {
        player = new Sound({ ...snd, enabled: true }, snd.musicVolume, snd.sfxVolume, false);
        player.start();
      }
      return player;
    };
    const testBtn = (label: string, fn: (p: Sound) => void) => {
      const b = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, label);
      b.addEventListener('click', () => fn(ensurePlayer()));
      return b;
    };
    const playMusic = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, `▶ ${t('test')}`);
    playMusic.addEventListener('click', () => {
      stopPlayer();
      ensurePlayer();
    });
    const stopMusic = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, `■ ${t('stop')}`);
    stopMusic.addEventListener('click', stopPlayer);

    // Playlist upload: several files at once, sent one by one.
    const files = h('input', { type: 'file', multiple: true, accept: 'audio/*,.mp3,.ogg,.m4a,.wav,.aac', class: 'input' });
    const uploadBtn = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, `⬆ ${t('uploadSongs')}`);
    uploadBtn.addEventListener('click', async () => {
      const list = Array.from(files.files ?? []);
      if (!list.length) return;
      uploadBtn.disabled = true;
      let ok = 0;
      for (const [i, f] of list.entries()) {
        uploadBtn.textContent = `${t('uploading')} ${i + 1}/${list.length}`;
        const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
        const type = f.type || AUDIO_EXT[ext] || 'audio/mpeg';
        try {
          const res = await fetch('/api/admin/music', {
            method: 'POST',
            headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(f.name), Authorization: `Bearer ${sessionStorage.getItem('snakeAdminToken') ?? ''}` },
            body: f,
          });
          if (res.ok) ok++;
          else toast(`${f.name}: ${t('saveError')}`, 'error');
        } catch {
          toast(`${f.name}: ${t('saveError')}`, 'error');
        }
      }
      await loadSettings(true);
      if (ok) toast(t('saved'));
      void render(root);
    });

    const removeTrack = async (url: string) => {
      await api('DELETE', `/api/admin/music?url=${encodeURIComponent(url)}`);
      await loadSettings(true);
      void render(root);
    };
    const removeAll = h('button', { type: 'button', class: 'btn btn-danger btn-sm' }, t('removeAll'));
    removeAll.disabled = !snd.tracks.length;
    removeAll.addEventListener('click', async () => {
      if (!confirm(t('removeAll') + '?')) return;
      try {
        await api('DELETE', '/api/admin/music');
        await loadSettings(true);
        void render(root);
      } catch (err) {
        toast(`${t('saveError')} (${err instanceof ApiError ? err.code : 'ERROR'})`, 'error');
      }
    });

    const move = (i: number, d: number) => {
      const j = i + d;
      if (j < 0 || j >= snd.tracks.length) return;
      [snd.tracks[i], snd.tracks[j]] = [snd.tracks[j], snd.tracks[i]];
      changed();
      redraw();
    };

    const trackList = snd.tracks.length
      ? h(
          'ol',
          { class: 'tracks' },
          ...snd.tracks.map((tr, i) => {
            const name = h('input', { class: 'input', maxlength: 80 });
            name.value = tr.name;
            name.addEventListener('input', () => {
              tr.name = name.value.slice(0, 80) || 'Track';
              changed();
            });
            const up = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': 'up' }, '↑');
            up.disabled = i === 0;
            up.addEventListener('click', () => move(i, -1));
            const down = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': 'down' }, '↓');
            down.disabled = i === snd.tracks.length - 1;
            down.addEventListener('click', () => move(i, 1));
            const del = h('button', { type: 'button', class: 'btn btn-danger btn-sm' }, '×');
            del.addEventListener('click', () => void removeTrack(tr.url));
            return h(
              'li',
              { class: 'track' },
              h('span', { class: 'track-n' }, String(i + 1)),
              h('div', { class: 'track-main' }, name, h('audio', { controls: true, src: tr.url, preload: 'none', class: 'audio' })),
              h('div', { class: 'track-actions' }, up, down, del)
            );
          })
        )
      : h('p', { class: 'muted' }, t('noTracks'));

    return [
      h(
        'div',
        { class: 'grid2' },
        card(
          null,
          h('label', { class: 'switch-row' }, toggle(snd.enabled, (v) => set('enabled', v)), h('strong', null, t('soundEnabled'))),
          field(
            t('musicStyle'),
            select(
              snd.musicStyle,
              [
                ['chill', t('musicChill')],
                ['arcade', t('musicArcade')],
                ['off', t('musicOff')],
              ],
              (v) => {
                set('musicStyle', v);
                stopPlayer();
              }
            )
          ),
          field(
            t('musicVolume'),
            range(snd.musicVolume, (v) => {
              set('musicVolume', v);
              player?.setVolumes(v, snd.sfxVolume, false);
            })
          ),
          field(
            t('sfxVolume'),
            range(snd.sfxVolume, (v) => {
              set('sfxVolume', v);
              player?.setVolumes(snd.musicVolume, v, false);
            })
          ),
          h('div', { class: 'row' }, playMusic, stopMusic, testBtn(t('testEat'), (p) => p.eat()), testBtn(t('testBoost'), (p) => p.boost()), testBtn(t('testKill'), (p) => p.kill()), testBtn(t('testDeath'), (p) => p.death())),
          h('p', { class: 'muted small' }, t('playersCanChange'))
        ),
        card(
          t('playlist'),
          h('p', { class: 'muted small' }, t('playlistHelp')),
          h('div', { class: 'row' }, files, uploadBtn),
          h('label', { class: 'switch-row' }, toggle(snd.shuffle, (v) => set('shuffle', v)), t('shuffle')),
          trackList,
          h('div', { class: 'row' }, removeAll)
        )
      ),
    ];
  });

  return stopPlayer;
}
