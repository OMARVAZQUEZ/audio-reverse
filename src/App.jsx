
import { useEffect, useRef, useState } from 'react';

const fmt = n =>
  `${Math.floor((n || 0) / 60)}:${String(Math.floor((n || 0) % 60)).padStart(2, '0')}`;

export default function App() {
  const [clips, setClips] = useState({
    original: null,
    player: null
  });

  const [recording, setRecording] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('¡Prepárense para el reto!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const recorder = useRef(null);
  const streamRef = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceRef = useRef(null);
  const urls = useRef([]);

  useEffect(() => {
    return () => {
      clearInterval(timer.current);

      if (recorder.current?.state === 'recording') {
        recorder.current.onstop = null;
        recorder.current.stop();
      }

      streamRef.current?.getTracks().forEach(track => track.stop());

      audioRef.current?.pause();

      try {
        sourceRef.current?.stop();
      } catch {}

      audioContextRef.current?.close();

      urls.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  function storeClip(key, blob) {
    if (!blob || blob.size === 0) {
      setError('La grabación está vacía. Intenta grabar de nuevo.');
      return;
    }

    const url = URL.createObjectURL(blob);
    urls.current.push(url);

    setClips(previous => ({
      ...previous,
      [key]: { blob, url }
    }));
  }

  async function startRecording(key) {
    if (recording || busy) return;

    setError('');

    if (
      !navigator.mediaDevices?.getUserMedia ||
      !window.MediaRecorder
    ) {
      setError(
        'Tu navegador no permite grabar. Usa una versión actualizada de Chrome o Safari y abre la página mediante HTTPS.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      streamRef.current = stream;
      chunks.current = [];

      let options = {};

      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options.mimeType = 'audio/mp4';
      }

      const mr = new MediaRecorder(stream, options);
      recorder.current = mr;

      mr.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          chunks.current.push(event.data);
        }
      };

      mr.onerror = () => {
        setError('Ocurrió un error durante la grabación.');
        clearInterval(timer.current);
        setRecording('');
      };

      mr.onstop = () => {
        const mimeType =
          mr.mimeType ||
          chunks.current[0]?.type ||
          'application/octet-stream';

        const blob = new Blob(chunks.current, { type: mimeType });

        if (blob.size > 0) {
          storeClip(key, blob);

          setStatus(
            key === 'original'
              ? 'Audio original guardado. ¡Ahora escúchalo al revés!'
              : 'Tu intento quedó grabado. ¡Escúchalo al revés!'
          );
        } else {
          setError('No se capturó audio. Intenta grabar otra vez.');
        }

        chunks.current = [];

        stream.getTracks().forEach(track => track.stop());

        if (streamRef.current === stream) {
          streamRef.current = null;
        }

        setRecording('');
        clearInterval(timer.current);
      };

      mr.start(250);

      setRecording(key);
      setElapsed(0);

      setStatus(
        key === 'original'
          ? 'Grabando el mensaje original…'
          : 'Grabando el intento de la segunda persona…'
      );

      timer.current = setInterval(() => {
        setElapsed(seconds => seconds + 1);
      }, 1000);
    } catch (err) {
      console.error('Error de micrófono:', err);

      setError(
        'No se pudo acceder al micrófono. Revisa los permisos del navegador y vuelve a intentarlo.'
      );

      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }

  function stopRecording() {
    clearInterval(timer.current);

    if (recorder.current?.state === 'recording') {
      recorder.current.stop();
    }
  }

  async function playClip(key, reverse = false) {
    const clip = clips[key];

    if (!clip?.blob || busy) return;

    setError('');
    setBusy(true);
    setPlaying(false);

    stopPlayback(false);

    let context = null;
    let source = null;

    try {
      if (reverse) {
        const AudioContextClass =
          window.AudioContext || window.webkitAudioContext;

        if (!AudioContextClass) {
          throw new Error(
            'Este navegador no admite el procesamiento de audio.'
          );
        }

        setStatus('Preparando audio invertido…');

        context = new AudioContextClass();
        audioContextRef.current = context;

        // Solicita reactivar el audio mientras aún estamos
        // dentro de la acción del usuario.
        await context.resume();

        const arrayBuffer = await clip.blob.arrayBuffer();
        const decoded = await context.decodeAudioData(arrayBuffer);

        // Crea un búfer nuevo con las muestras en orden inverso.
        const reversed = context.createBuffer(
          decoded.numberOfChannels,
          decoded.length,
          decoded.sampleRate
        );

        for (
          let channel = 0;
          channel < decoded.numberOfChannels;
          channel++
        ) {
          const originalData = decoded.getChannelData(channel);
          const reversedData = reversed.getChannelData(channel);

          for (let i = 0, j = originalData.length - 1;
               i < originalData.length;
               i++, j--) {
            reversedData[i] = originalData[j];
          }
        }

        source = context.createBufferSource();
        source.buffer = reversed;
        source.connect(context.destination);

        sourceRef.current = source;

        source.onended = () => {
          if (sourceRef.current !== source) return;

          sourceRef.current = null;

          if (audioContextRef.current === context) {
            audioContextRef.current = null;
          }

          context.close().catch(() => {});

          setPlaying(false);
          setBusy(false);
          setStatus('Reproducción terminada. ¡Ahora intenta imitarlo!');
        };

        setStatus('Escuchando el audio al revés…');
        setPlaying(true);

        // Reproduce las muestras ya invertidas.
        source.start(0);
      } else {
        // Reproducción normal.
        const audio = new Audio(clip.url);
        audioRef.current = audio;

        audio.onended = () => {
          if (audioRef.current !== audio) return;

          audioRef.current = null;
          setPlaying(false);
          setBusy(false);
          setStatus('Reproducción terminada.');
        };

        audio.onerror = () => {
          if (audioRef.current !== audio) return;

          audioRef.current = null;
          setPlaying(false);
          setBusy(false);
          setError('No se pudo reproducir el audio original.');
        };

        setStatus('Reproduciendo grabación…');
        setPlaying(true);

        await audio.play();
        setBusy(false);
      }
    } catch (err) {
      console.error('Error al reproducir audio:', err);

      try {
        source?.stop();
      } catch {}

      if (audioContextRef.current === context) {
        audioContextRef.current = null;
      }

      if (context && context.state !== 'closed') {
        await context.close().catch(() => {});
      }

      if (sourceRef.current === source) {
        sourceRef.current = null;
      }

      audioRef.current?.pause();
      audioRef.current = null;

      setPlaying(false);
      setBusy(false);

      setError(
        err?.name === 'NotAllowedError'
          ? 'El navegador bloqueó el audio. Pulsa reproducir nuevamente.'
          : err?.name === 'EncodingError' ||
              err?.name === 'NotSupportedError'
            ? 'No se pudo leer el formato de esta grabación. Graba un audio nuevo e inténtalo otra vez.'
            : err?.message || 'No se pudo procesar el audio.'
      );
    }
  }

  function stopPlayback(updateStatus = true) {
    audioRef.current?.pause();
    audioRef.current = null;

    if (sourceRef.current) {
      const source = sourceRef.current;
      sourceRef.current = null;

      source.onended = null;

      try {
        source.stop();
      } catch {}
    }

    if (audioContextRef.current) {
      const context = audioContextRef.current;
      audioContextRef.current = null;

      context.close().catch(() => {});
    }

    setPlaying(false);
    setBusy(false);

    if (updateStatus) {
      setStatus('Reproducción detenida.');
    }
  }

  function download(key) {
    const clip = clips[key];

    if (!clip) return;

    const mime = clip.blob.type || '';
    const extension = mime.includes('mp4')
      ? 'm4a'
      : mime.includes('wav')
        ? 'wav'
        : mime.includes('ogg')
          ? 'ogg'
          : 'webm';

    const link = document.createElement('a');
    link.href = clip.url;
    link.download = `${
      key === 'original'
        ? 'audio-original'
        : 'intento-segunda-persona'
    }.${extension}`;

    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function reset() {
    stopPlayback(false);

    if (recording) {
      stopRecording();
    }

    setClips({
      original: null,
      player: null
    });

    setError('');
    setStatus('¡Reto reiniciado! Graben un nuevo mensaje.');
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">↶</div>

        <div>
          <p className="eyebrow">EL RETO VIRAL</p>
          <h1>
            Reverse <span>Audio</span>
          </h1>
        </div>

        <div className="pill">
          <i /> AUDIO
        </div>
      </header>

      <section className="hero">
        <div className="badge">🎙️ ¿PUEDES REPETIRLO?</div>

        <h2>
          Escucha al revés.
          <br />
          <span>¡Y repítelo!</span>
        </h2>

        <p>
          Graba una frase, inviértela y reta a otra persona a
          imitar lo que escucha.
        </p>

        <div className="wave">
          {Array.from({ length: 41 }, (_, i) => (
            <i
              key={i}
              style={{
                height: `${
                  12 +
                  Math.abs(
                    Math.sin(i * 1.7) * Math.cos(i * 0.31)
                  ) *
                    48
                }px`
              }}
            />
          ))}
        </div>

        <div className="status">
          <i />
          {status}
        </div>
      </section>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <section className="grid">
        <article
          className={`card ${
            recording === 'original' ? 'recording' : ''
          }`}
        >
          <div className="cardhead">
            <span>01</span>
            <b>🎤</b>
          </div>

          <h3>Graba la frase</h3>

          <p className="muted">
            Persona 1 · Di cualquier frase sin que la otra persona
            la vea.
          </p>

          <div className="audioPanel">
            <div className="audioIcon">♫</div>

            <div>
              <strong>
                {clips.original
                  ? 'Audio original listo'
                  : recording === 'original'
                    ? 'Grabando…'
                    : 'Tu mensaje secreto'}
              </strong>

              <small>
                {recording === 'original'
                  ? fmt(elapsed)
                  : clips.original
                    ? 'Grabación guardada'
                    : 'Presiona grabar para empezar'}
              </small>
            </div>

            {recording === 'original' && (
              <i className="recDot" />
            )}
          </div>

          {!clips.original && recording !== 'original' && (
            <button
              className="btn primary"
              onClick={() => startRecording('original')}
              disabled={busy || Boolean(recording)}
            >
              ● Grabar audio
            </button>
          )}

          {recording === 'original' && (
            <button className="btn stop" onClick={stopRecording}>
              ■ Detener grabación
            </button>
          )}

          {clips.original && recording !== 'original' && (
            <div className="stack">
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => playClip('original')}
              >
                ▶ Escuchar original
              </button>

              <button
                className="btn reverse"
                disabled={busy}
                onClick={() => playClip('original', true)}
              >
                ↶ Reproducir al revés
              </button>

              <button
                className="btn quiet"
                disabled={busy || Boolean(recording)}
                onClick={() => {
                  stopPlayback(false);
                  setClips(previous => ({
                    ...previous,
                    original: null
                  }));
                  startRecording('original');
                }}
              >
                ＋ Grabar de nuevo
              </button>
            </div>
          )}
        </article>

        <article
          className={`card ${
            recording === 'player' ? 'recording' : ''
          }`}
        >
          <div className="cardhead">
            <span>02</span>
            <b>🧠</b>
          </div>

          <h3>Repite lo que oíste</h3>

          <p className="muted">
            Persona 2 · Escucha el audio invertido e intenta
            imitarlo.
          </p>

          <div className="audioPanel">
            <div className="audioIcon purple">◖</div>

            <div>
              <strong>
                {clips.player
                  ? 'Tu intento está listo'
                  : recording === 'player'
                    ? 'Grabando tu intento…'
                    : '¿Qué acabas de escuchar?'}
              </strong>

              <small>
                {recording === 'player'
                  ? fmt(elapsed)
                  : clips.player
                    ? 'Listo para invertir'
                    : '¡No veas la frase original!'}
              </small>
            </div>

            {recording === 'player' && (
              <i className="recDot" />
            )}
          </div>

          {!clips.original && (
            <div className="hint">
              Primero graba el audio de la persona 1.
            </div>
          )}

          {clips.original &&
            !clips.player &&
            recording !== 'player' && (
              <div className="stack">
                <button
                  className="btn reverse"
                  disabled={busy}
                  onClick={() => playClip('original', true)}
                >
                  ↶ Escuchar audio al revés
                </button>

                <button
                  className="btn primary"
                  disabled={busy || Boolean(recording)}
                  onClick={() => startRecording('player')}
                >
                  ● Grabar mi intento
                </button>
              </div>
            )}

          {recording === 'player' && (
            <button className="btn stop" onClick={stopRecording}>
              ■ Detener grabación
            </button>
          )}

          {clips.player && recording !== 'player' && (
            <div className="stack">
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => playClip('player')}
              >
                ▶ Escuchar mi grabación
              </button>

              <button
                className="btn reverse"
                disabled={busy}
                onClick={() => playClip('player', true)}
              >
                ↶ Mi audio al revés
              </button>

              <button
                className="btn quiet"
                disabled={busy || Boolean(recording)}
                onClick={() => {
                  stopPlayback(false);
                  setClips(previous => ({
                    ...previous,
                    player: null
                  }));
                  startRecording('player');
                }}
              >
                ＋ Intentar otra vez
              </button>
            </div>
          )}
        </article>
      </section>

   
<section className="compare">
  <div className="trophy">🏁</div>

  <div className="compareText">
    <h3>¡Hora de comparar!</h3>
    <p>
      Escuchen las dos versiones y descubran si lograron
      descifrar el mensaje.
    </p>
  </div>

  <div className="stack">
    <button
      className="btn primary"
      disabled={!clips.original || busy}
      onClick={() => playClip('original')}
    >
      ▶ Escuchar original
    </button>

    <button
      className="btn reverse"
      disabled={!clips.original || busy}
      onClick={() => playClip('original', true)}
    >
      ↶ Escuchar original al revés
    </button>

    <button
      className="btn primary"
      disabled={!clips.player || busy}
      onClick={() => playClip('player')}
    >
      ▶ Escuchar intento
    </button>

    <button
      className="btn reverse"
      disabled={!clips.player || busy}
      onClick={() => playClip('player', true)}
    >
      ↶ Escuchar intento al revés
    </button>

    {playing && (
      <button
        className="btn stop"
        onClick={() => stopPlayback()}
      >
        ■ Detener reproducción
      </button>
    )}
  </div>
</section>


      {playing && (
        <button className="floating" onClick={() => stopPlayback()}>
          ■ Detener audio
        </button>
      )}

      <footer>
        <span>REVERSE AUDIO CHALLENGE</span>

        <button onClick={reset}>↻ Reiniciar reto</button>

        <p>
          El audio se procesa en este dispositivo; no se sube a
          un servidor.
        </p>
      </footer>
    </main>
  );
}
