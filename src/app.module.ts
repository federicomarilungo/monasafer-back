import { DynamicModule, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SaludController } from './salud.controller';
import { AdminController } from './admin/admin.controller';
import { DatosModule } from './datos/datos.module';

@Module({})
export class AppModule {
  /**
   * Sin MONGO_URI la API levanta solo con /ping y /salud (sirvió para el primer deploy).
   * Con base, suma login, perfil, gastos, reservas y cálculo (DatosModule).
   */
  static crear(mongoUri = process.env.MONGO_URI): DynamicModule {
    const conBase = mongoUri
      ? [
          MongooseModule.forRoot(mongoUri, {
            maxPoolSize: 5,
            serverSelectionTimeoutMS: 15000,
          }),
          DatosModule,
        ]
      : [];
    return {
      module: AppModule,
      imports: conBase,
      controllers: [SaludController, AdminController],
    };
  }
}
