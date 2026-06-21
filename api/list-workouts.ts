import type { VercelRequest, VercelResponse } from '@vercel/node';

const GC_API = 'https://connectapi.garmin.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { accessToken } = req.body ?? {};
  if (!accessToken || typeof accessToken !== 'string') {
    return res.status(400).json({ error: 'Token de Garmin requerido.' });
  }

  try {
    const listRes = await fetch(`${GC_API}/workout-service/workouts?start=0&limit=100`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'NK': 'NT',
        'di-backend': 'connectapi.garmin.com',
      },
    });

    const text = await listRes.text();

    if (listRes.status === 401) {
      return res.status(401).json({ error: 'Token de Garmin expirado o inválido.' });
    }

    if (!listRes.ok) {
      return res.status(502).json({ error: `Error de Garmin (${listRes.status}): ${text.slice(0, 200)}` });
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
    console.error('[list-workouts] Error:', msg);
    return res.status(500).json({ error: 'Error al listar los entrenamientos: ' + msg });
  }
}
