
import express from 'express';

const app = express();
const PORT = Number(process.env.PORT || 8000);

app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: "Zala QI's World GPU Engine",
    status: 'online',
    gpuGenerationReady: false
  });
});

app.post('/generate', (req, res) => {
  res.status(503).json({
    ok: false,
    error:
      'GPU video generation is not configured yet. ' +
      'No generation has been started.'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Zala QI's World GPU server listening on port ${PORT}`
  );
});
