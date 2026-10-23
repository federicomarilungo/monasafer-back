import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { UsuarioId } from '../auth/usuario.guard';
import { Limitador } from '../auth/limite';
import * as v from '../datos/validar';
import { ComentariosService } from './comentarios.service';
import { TIPOS_COMENTARIO } from './esquemas';

const DIA = 24 * 60 * 60 * 1000;

@Controller('comentarios')
export class ComentariosController {
  constructor(private readonly s: ComentariosService) {}

  private readonly limite = new Limitador();

  /** `{tipo: idea|error|otro, texto, pantalla?}`: propuestas de mejora de quien usa la app. */
  @Post()
  enviar(@UsuarioId() u: string, @Body() body: unknown) {
    const b = v.objeto(body);
    const tipo = b.tipo ?? 'idea';
    if (!TIPOS_COMENTARIO.includes(tipo as string))
      throw new BadRequestException(`tipo: ${TIPOS_COMENTARIO.join(', ')}`);
    const texto = v.texto(b.texto, 'texto', 2000);
    const pantalla = v.texto(b.pantalla, 'pantalla', 40, false);
    this.limite.usar(`comentario:${u}`, 10, DIA);
    return this.s.enviar(u, { tipo: tipo as string, texto, pantalla });
  }
}
