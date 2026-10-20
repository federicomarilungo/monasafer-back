import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SaludController } from './salud.controller';
import { AdminController } from './admin/admin.controller';

// Sin MONGO_URI la API levanta sin base: sirve para el primer deploy, antes de que exista
// el usuario de Atlas. Los módulos que guardan datos la van a exigir.
const base = process.env.MONGO_URI
  ? [
      MongooseModule.forRoot(process.env.MONGO_URI, {
        maxPoolSize: 5,
        serverSelectionTimeoutMS: 15000,
      }),
    ]
  : [];

@Module({
  imports: [...base],
  controllers: [SaludController, AdminController],
})
export class AppModule {}
