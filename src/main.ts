import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

// Los meses se calculan en hora argentina salvo que se diga otra cosa.
process.env.TZ ??= 'America/Argentina/Buenos_Aires';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.crear(),
  );
  // Las capturas que se le mandan a Mona (premium) pesan más que los 100 kB por defecto.
  app.useBodyParser('json', { limit: '3mb' });
  const origenes = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origenes });
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`🐒 Monasafer API en http://0.0.0.0:${port}`);
}

void bootstrap();
