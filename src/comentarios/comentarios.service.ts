import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Correo } from '../auth/correo';
import { Usuario } from '../datos/esquemas';
import { Comentario } from './esquemas';

const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const ETIQUETA: Record<string, string> = {
  idea: '💡 Idea',
  error: '🐛 Algo no anda',
  otro: '💬 Comentario',
};

@Injectable()
export class ComentariosService {
  constructor(
    @InjectModel(Comentario.name) private readonly comentarios: Model<Comentario>,
    @InjectModel(Usuario.name) private readonly usuarios: Model<Usuario>,
    private readonly correo: Correo,
  ) {}

  /** Guarda el comentario y avisa por email. Si el email no sale (sin Resend), igual queda guardado. */
  async enviar(
    usuarioId: string,
    c: { tipo: string; texto: string; pantalla: string },
  ) {
    const u = await this.usuarios.findById(usuarioId);
    if (!u) throw new NotFoundException();
    const doc = await this.comentarios.create({
      usuarioId: u._id,
      email: u.email,
      nombre: u.nombre,
      idioma: u.idioma,
      ...c,
    });
    const para = process.env.COMENTARIOS_PARA ?? 'admin@monasafer.com';
    const quien = u.nombre ? `${u.nombre} (${u.email})` : u.email;
    void this.correo.enviar(
      para,
      `${ETIQUETA[c.tipo]} de ${u.nombre || u.email}`,
      `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#2b2118">
<p><b>${ETIQUETA[c.tipo]}</b> de ${escapar(quien)}${c.pantalla ? ` · desde <i>${escapar(c.pantalla)}</i>` : ''}</p>
<p style="white-space:pre-wrap;background:#fff6e5;padding:12px 16px;border-radius:12px">${escapar(c.texto)}</p>
<p style="color:#8a7a66;font-size:13px">Respondé este email para contestarle. Id: ${doc.id}</p>
</div>`,
      u.email,
    );
    return { ok: true, id: doc.id };
  }

  async borrarDatos(usuarioId: string) {
    await this.comentarios.deleteMany({ usuarioId: new Types.ObjectId(usuarioId) });
  }
}
