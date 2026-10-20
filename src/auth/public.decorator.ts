import { SetMetadata } from '@nestjs/common';

export const ES_PUBLICO = 'esPublico';
/** Marca un endpoint (o controller) como abierto. Todo lo demás pide login. */
export const Public = () => SetMetadata(ES_PUBLICO, true);
