import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export const TIPOS_COMENTARIO = ['idea', 'error', 'otro'];

/**
 * Lo que la gente propone para mejorar la app. Se guarda una copia del email y el nombre
 * para leerlos con /admin/consulta sin cruzar con usuarios.
 */
@Schema({ collection: 'comentarios', timestamps: true })
export class Comentario {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  usuarioId: Types.ObjectId;
  @Prop({ required: true }) email: string;
  @Prop({ default: '' }) nombre: string;
  @Prop({ required: true, enum: TIPOS_COMENTARIO }) tipo: string;
  @Prop({ required: true }) texto: string;
  /** Pantalla desde donde lo mandó (ej. "inicio"), para entender el contexto. */
  @Prop({ default: '' }) pantalla: string;
  @Prop({ default: '' }) idioma: string;
  /** nuevo · leido · hecho: para ir marcando a mano qué se atendió. */
  @Prop({ default: 'nuevo' }) estado: string;
}
export const ComentarioSchema = SchemaFactory.createForClass(Comentario);
