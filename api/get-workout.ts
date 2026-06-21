import type { VercelRequest, VercelResponse } from '@vercel/node';

const GC_API = 'https://connectapi.garmin.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { workoutId, accessToken } = req.body ?? {};
  if (!workoutId) {
    return res.status(400).json({ error: 'ID de entrenamiento requerido.' });
  }
  if (!accessToken || typeof accessToken !== 'string') {
    return res.status(400).json({ error: 'Token de Garmin requerido.' });
  }

  try {
    const getRes = await fetch(`${GC_API}/workout-service/workout/${workoutId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'NK': 'NT',
        'di-backend': 'connectapi.garmin.com',
      },
    });

    const text = await getRes.text();

    if (getRes.status === 401) {
      return res.status(401).json({ error: 'Token de Garmin expirado o inválido.' });
    }

    if (!getRes.ok) {
      return res.status(502).json({ error: `Error de Garmin (${getRes.status}): ${text.slice(0, 200)}` });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: 'Respuesta inválida de Garmin.' });
    }

    return res.status(200).json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[get-workout] Error:', msg);
    return res.status(500).json({ error: 'Error al obtener el entrenamiento: ' + msg });
  }
}
