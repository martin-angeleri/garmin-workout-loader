# Garmin Workout Loader

> © 2024 Martín Angeleri. Todos los derechos reservados.

Aplicación web que permite cargar entrenamientos de carrera en **Garmin Connect** simplemente escribiéndolos en texto libre (español). La IA interpreta el entrenamiento y lo convierte al formato nativo de Garmin, listo para sincronizar con tu reloj.

---

## ¿Cómo funciona?

1. **Escribís** el entrenamiento como lo harías en un mensaje de WhatsApp
2. **GPT-4o** lo interpreta y genera la estructura de workout de Garmin (pasos, repeticiones, tiempos, distancias)
3. **Revisás** el preview antes de subir
4. **Se sube directamente** a tu biblioteca de workouts de Garmin Connect
5. En tu reloj, sincronizás y ¡listo!

### Ejemplo de entrada

```
-E/calor: 2,5km suaves
-10 x 400m progresivos terminando al 80%. Pausa de 50s
-Reg: 15min suaves
```

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + TypeSc| Frontend | React 19 + TypeSc| Frontend | React 19 + TypeSc| Frontend | React 19 + Typ | `garmin-connect` npm pac| Frontend | React 19 + TypeSc| Frontend | React 19 + Typ | | Frontend | React 19 + TypeSc| Frontend | React 19 + TypeSc| Frontend | React 19 + TypeSc| Frontend | React 19 + Typ | `garmin-connect` npm pac| Frontend | React 19 + TypeSc| Frontend | React 19 + Typ | | Frontend | React 19 + TypeSc| Frontend | Reacgarmin.com))
- Cuenta en [Verc- Cuenta en [Verc- Cuenta en [Verc- Cuenta en [Verc- Cuenta en

```bash
git clone https://github.com/TU_USUARIO/garmin-workout-loader.git
cd garmin-workout-loader
npm install
```

### 2. Conf### 2. Conf### 2. Conf### 2. Conf### 2. ar### 2. Conf### 2. Conf### 2. Conf### 2. Conf### 2. ar### 2. Conf##API_KEY=sk-tu-clave-de-openai-aqui
```

> ⚠️ Nunca subas este archivo al repositorio. Ya está incluido en `.gitignore`.

### 3. Instalar Vercel CLI (para desarrollo local con funciones)

```bash
npm install -g vercel
vercel link   # conecta con tu proyecto de Vercel (primera vez)
vercel dev    # inicia el servidor con soporte de funciones serverless
```

Abrí [http://localhost:3000](http://localhost:3000)

> **Nota:** `vite dev` (sin Vercel CLI) funciona para el frontend solo, pero las llamadas a `/api/*` fallarán. Usá siempre `vercel dev` para el desarrollo completo.

---

## Deploy en Vercel (producción)

### Opción A — Deploy automático desde GitHub (recomendado)

1. Hacer fork o push del repo a tu cuenta de GitHub
2. Ir a [vercel.com](https://vercel.com) → **Add New Project**
3. Importar el repositorio de GitHub
4. Vercel detecta automáticamente que es un proyecto Vit4.5. 4. Vercel detecta automáticamente que es un proyecto Vit4.5. 4. Vercel detecta automáticamente que es un proyecto Vit4.5. 4. Vercel detecta automáticutomático.

### Opción B — Deploy desde CLI

```bash
npm install -g vercel
vercel --prod
vercel --prod
 vercel
oy desde CLI
que es un proyecto Vit4.a app por primera vez, aparece un **modal de configuración**
2. Ingresá tu **email** y **contraseña** de Garmin Connect
3. Las credenciales se guardan solo en tu navegador (localStorage)
4. Para cambiarlas después: click en el avatar/email en el header → *Cambiar cuenta*

---

## Seguridad

- Las credenciales de Garmin **solo se guardan en tu navegador** (`localStorage`)
- Se envían por **HTTPS** a la función serverless únicamente al momento de subir
- **No se almacenan en ningún servidor**
- La `OPENAI_API_KEY` vive exclusivamente en las variables de entorno de Vercel, nunca en el frontend
- Esta app usa la API no oficial de Garmin Connect- Esta app usa la API no oficial de Garmin Connect- Esta app usa la API no oficial de Garmin Connect- Esta app usa la API no oficial de Garmin Connect- Esta app usa la API no oficial de Garmin Connect- Esta app usa la API nox                   # Entry point
│   ├─�│   ex.css                  # Esti│   ├─ + Tailwind
│   ├�│   ├�│   ├�│   ├�│   ├�│   ├�│   ├�│   ├�│   �ó│   ├�│   ├�│   ├�│   ├�│   ├�│   │   ├�│   ├�│   ├�│   ├�│   ├�│   └� WorkoutInput.tsx       # Textarea de ingreso + ejemplos
│   │   ├── WorkoutPrevi�.ts│   │  vie│   │   ├── WorkoutPrevi�.ts│   │  vie│   │   ├── Worko Pantalla de éxito con link a Garmin
│   ├── hooks/
│   │   └── useCredentials.ts      # Hook para manejar cr│   │   └── useCredentials.ts      # Hook para manejar cr│   │   └── useCr Tipos T│   │   └── useCredentials.ts      # Hook para manejar cr│   │   └── useCredentials.ts      # Hook para manejar cr│   │   └── useCr Tipos T│   │   └── useCredentials.ts      # Hook para manejar cr│   │   └── useCredentials.ts      # Hook para manejar cr│it│   │   └── useCredentials.ts      # Hook para manejar cr�fig │   │   └── useCredentials.ts      # Hook para manejar cr│   │   └── useCredentials.ts      # Hook para manejar cr│   │   └── useCr Tipos T│   │   └── useCredentials.ts      # Hook para manejar cr│   │   └── useCredentials.ts   ve│   │   └── useCredentials.ts      # Hook para manejar cr│   │   └── useCredentials.ts      # Hook para manejar cr│   │   └── useCr Tipos 
-Reg: 15min suaves
```

### Rodaje simple

```
-45min a ritmo moderado
```

---

## Notas importantes

- Esta app utiliza la **API no oficial** de Garmin Connect. Garmin puede cambiar su autenticación en cualquier momento
- Si el login falla, verificá que las credenciales sean correctas y que no tengas activado el 2FA en tu cuenta Garmin
- Los workouts se crean en **"Mi biblioteca"** de Garmin Connect. Desde ahí podés enviarlos a tu reloj o agendarlos
- Para agendarlos en el calendario, hacelo manualmente desde la app Garmin Connect o Garmin Connect Web

---

## Licencia

© 2024 **Martín Angeleri**. Todos los derechos reservados.

Este software es de uso personal. No se permite reproducir, distribuir ni modificar sin autorización expresa del autor.

---

*Garmin® y Garmin Connect® son marcas registradas de Garmin Ltd. Esta aplicación no tiene afiliación con Garmin.*
