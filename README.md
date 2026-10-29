# Reverse Audio Challenge

App React + Vite para grabar audio, escucharlo normal o invertido y grabar el intento de otra persona.

## Ejecutar
Necesitas Node.js instalado. En la carpeta del proyecto ejecuta:

```bash
npm install
npm run dev
```

Abre la dirección que muestre Vite. Para crear la versión de producción:

```bash
npm run build
```

Los archivos se generan en `dist/`. El micrófono requiere permiso y, para usar la app desde otros dispositivos, publica el sitio con HTTPS. El audio se procesa en el navegador y no se sube a un servidor. La compatibilidad de códecs puede variar entre navegadores.
