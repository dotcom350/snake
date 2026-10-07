import type { SoundSettings } from '@snake/shared/site-config';
import { api, ApiError } from '../api';
import { h, card, field, select, toggle, toast } from '../ui';
import { t } from '../i18n';
import { settingsPage } from './common';
import { loadSettings } from '../state';
import { Sound } from '../../game/audio';

export async function render(root: HTMLElement): Promise<() => void> {
  let player: Sound | null = null;
  const stopPlayer = () => {
    player?.stop();
    player = null;
  };

  await settingsPage(root, 'sound', t('soundTitle'), (snd, { changed }) => {
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

    const file = h('input', { type: 'file', accept: 'audio/mpeg,audio/ogg,audio/mp4,audio/x-m4a,audio/wav,audio/aac,.mp3,.ogg,.m4a,.wav,.aac', class: 'input' });
    const uploadBtn = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, t('upload'));
    uploadBtn.addEventListener('click', async () => {
      const f = file.files?.[0];
      if (!f) return;
      uploadBtn.disabled = true;
      uploadBtn.textContent = t('uploading');
      try {
        const type = f.type || (f.name.endsWith('.mp3') ? 'audio/mpeg' : f.name.endsWith('.ogg') ? 'audio/ogg' : 'audio/mp4');
        await api('POST', '/api/admin/music', f, type);
        await loadSettings(true);
        toast(t('saved'));
        void render(root);
      } catch (err) {
        toast(`${t('saveError')} (${err instanceof ApiError ? err.code : 'ERROR'})`, 'error');
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = t('upload');
      }
    });
    const removeBtn = h('button', { type: 'button', class: 'btn btn-danger btn-sm' }, t('remove'));
    removeBtn.disabled = !snd.customMusicUrl;
    removeBtn.addEventListener('click', async () => {
      await api('DELETE', '/api/admin/music');
      await loadSettings(true);
      toast(t('saved'));
      void render(root);
    });

    return h(
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
        field(t('musicVolume'), range(snd.musicVolume, (v) => {
          set('musicVolume', v);
          player?.setVolumes(v, snd.sfxVolume, false);
        })),
        field(t('sfxVolume'), range(snd.sfxVolume, (v) => {
          set('sfxVolume', v);
          player?.setVolumes(snd.musicVolume, v, false);
        })),
        h('div', { class: 'row' }, playMusic, stopMusic, testBtn(t('testEat'), (p) => p.eat()), testBtn(t('testBoost'), (p) => p.boost()), testBtn(t('testKill'), (p) => p.kill()), testBtn(t('testDeath'), (p) => p.death())),
        h('p', { class: 'muted small' }, t('playersCanChange'))
      ),
      card(
        t('customMusic'),
        h('p', { class: 'muted small' }, t('customMusicHelp')),
        h('p', null, `${t('current')}: `, snd.customMusicUrl ? h('code', null, snd.customMusicUrl) : t('none')),
        snd.customMusicUrl ? h('audio', { controls: true, src: snd.customMusicUrl, preload: 'none', class: 'audio' }) : null,
        h('div', { class: 'row' }, file, uploadBtn, removeBtn)
      )
    );
  });

  return stopPlayer;
}
