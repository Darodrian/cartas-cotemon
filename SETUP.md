# Cartas Cotemon

Control en vivo de un visor de cartas 3D. Un panel privado envia comandos e imagenes a un overlay transparente por Supabase Realtime Broadcast. No hay servidor propio ni almacenamiento de imagenes: los archivos viajan por el websocket.

## Archivos

- `index.html` — visor 3D transparente. Es lo que se carga como Browser Source en OBS.
- `dashboard.html` — panel de control privado. Gestiona la clave, arrastra imagenes, elige la carta activa.
- `js/bridge.js` — conexion compartida con Supabase.
- `card-back.png` — dorso de la carta.

## Configuracion (una vez)

1. Entra en <https://supabase.com/dashboard> y crea un proyecto.
2. Abre **Connect** (arriba a la derecha) y copia:
   - **Project URL** — del tipo `https://abcdefgh.supabase.co`
   - La clave **publishable** (`sb_publishable_...`) o **anon** "public"
3. En `index.html` y `dashboard.html`, rellena solo esos dos valores. **La clave de overlay se deja vacia a proposito**, asi no viaja en el repositorio:

```html
<script type="application/json" id="cfg">
{ "supabaseUrl": "https://abcdefgh.supabase.co", "supabaseKey": "sb_publishable_...", "overlayKey": "" }
</script>
```

Las dos paginas deben tener los mismos valores.

## La clave de overlay

Es lo unico que separa tu panel del resto del mundo. Cada pagina la descubre por su cuenta:

1. El hash de la URL (`#key=...`) — lo usa el overlay.
2. Lo que tenga guardado en `localStorage` — lo usa el panel.
3. El campo `overlayKey` de la config, normalmente vacio.

La clave se usa **tal cual**: lo que escribas es el nombre del canal de Supabase. No se anade ningun prefijo.

El panel la genera por ti: abre **Generar** y就会出现 24 caracteres aleatorios de un alfabeto sin `0`, `o`, `1`, `i`, `l`, para que no se confundan al leerlos. Luego **Copiar URL de OBS** te lleva ya el enlace completo con la clave incluida, para pegar en OBS sin montar nada a mano.

## Publicar en GitHub Pages

En Settings → Pages, elige *Deploy from a branch*, rama `main`, carpeta `/ (root)`.

```
https://tu-usuario.github.io/cartas-cotemon/
```

## URLs finales

**Overlay (OBS).** Fuente Browser con la URL que copiaste desde el panel:

```
https://tu-usuario.github.io/cartas-cotemon/index.html#key=CLAVE
```

**Panel.** Abre esta pagina; la primera vez le pedira o generara la clave:

```
https://tu-usuario.github.io/cartas-cotemon/dashboard.html
```

## Como se usa

1. Abre el panel en un navegador normal.
2. Pulsa **Generar** y despues **Conectar**.
3. En OBS, anade una fuente **Browser** con la URL copiada. Fondo transparente, 1920x1080.
4. Arrastra imagenes PNG o JPG al panel. Se redimensionan a 600px de ancho y se recomprimen a JPEG (~145 KB) antes de enviarse.
5. Haz clic en una miniatura para emitirla en el overlay.

**Cambiar la clave** genera otra y reconecta el panel, pero el overlay dejara de recibir hasta que pegues la URL nueva en OBS. El aviso te lo recuerda y copia la URL nueva por ti.

## Como funciona

- El **panel** es el unico que envia. El **overlay** solo recibe. Sin bucles de eco.
- Los bytes de la imagen van en un payload binario con el nombre como cabecera de 4 bytes.
- El panel guarda su biblioteca en IndexedDB; el overlay guarda lo que recibe. Al recargar, cada uno se recupera solo.
- El estado de control es un JSON pequeno enviado en cada cambio: `{ name, dir, rot, speed, reset }`.

## Limites que conviene conocer

- **Nada se guarda en un servidor.** Si todos los navegadores borran sus datos locales, las cartas se pierden. Vuelve a arrastrar los archivos.
- **Supabase Broadcast no persiste.** Hay un buffer de replay de 72 horas, pero no es una biblioteca.
- **No es seguridad real.** El canal publico acepta a cualquiera con la clave. Manten la URL del panel sin publicar.
- **256 KB por mensaje.** El recorte a 600px mantiene las imagenes muy por debajo de ese limite.
- Si el panel esta en otro equipo que OBS, los bytes atraviesan ese navegador como intermediario. Con muchas cartas la sincronizacion inicial sera lenta; funciona mejor si ambas paginas estan en el mismo equipo.

## Caché de OBS

OBS guarda la pagina en cache con insistencia. Si cambias `index.html` y no ves el efecto, cambia el numero de version de Three.js en las dos lineas del importmap (puedes usar `0.186.2` aunque no exista todavia, lo unico que importa es que sea distinto). El comentario de arriba del importmap lo indica.

## Nota sobre claves de Supabase

Supabase esta retirando las claves `anon` a finales de 2026 en favor de las `publishable`. Ambas funcionan con este codigo. Nunca uses la clave `service_role`: omite todas las reglas de seguridad.

La clave `publishable` si puede publicarse en un repositorio: esta hecha para ir en el navegador. Lo que no debe publicarse nunca es tu **clave de overlay**.