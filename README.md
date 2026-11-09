# Prisma: inteligencia por token

Aplicación local para comparar el Intelligence Index de [Artificial Analysis](https://artificialanalysis.ai/models) con los precios y descuentos del catálogo público de [Cheaper Inference](https://cheaperinference.com/). Presenta una fila por modelo y nivel de esfuerzo evaluado, con una relación orientativa entre inteligencia y costo por tarea.

## Requisitos

- Node.js 22 o superior, con npm.
- Conexión a Internet para consultar ambas fuentes.
- No se requieren dependencias externas ni claves de API para ejecutar la aplicación.

## Ejecución

```bash
npm start
```

Abre [http://localhost:3000](http://localhost:3000). El servidor escucha únicamente en `127.0.0.1`; la primera consulta puede tardar unos segundos. Para usar otro puerto, define `PORT` antes de iniciar el servidor. Por ejemplo, en PowerShell:

```powershell
$env:PORT = 3001
npm start
```

## Comparador

La tabla muestra modelo, proveedor, esfuerzo, Intelligence Index, precios de entrada y salida en USD por millón de tokens, descuento publicado, costo por tarea, relación inteligencia/costo y enlaces a las fuentes. Permite buscar, filtrar por esfuerzo, ordenar y exportar los resultados visibles a CSV.

Se incluyen únicamente variantes que cumplen estos criterios:

- Índice de Artificial Analysis **superior a 32**, con esfuerzo `low`, `medium`, `high`, `xhigh` o `max` publicado.
- Coincidencia única entre la identidad del modelo en ambas fuentes.
- Modelo de texto con capacidad `web-search` y precios publicados por millón de tokens en el catálogo de Cheaper Inference.

La aplicación consulta las fuentes al cargar y renueva los datos como máximo cada cinco minutos. Si falla una consulta posterior, muestra un aviso y conserva la última respuesta en memoria mientras el servidor continúe ejecutándose. El botón de actualización consulta al servidor, que respeta ese intervalo.

## Costo por tarea y relación de valor

El costo por tarea de AA es el promedio ponderado publicado por Artificial Analysis para las evaluaciones del Intelligence Index, usando los precios de referencia de AA. El valor para Cheaper Inference es una **estimación**, calculada así:

```text
costo estimado por tarea en CI = costo por tarea de AA × (1 - descuento publicado / 100)
valor estimado = AA Index / costo estimado por tarea en CI
```

Una relación mayor indica más puntos de índice por dólar estimado bajo esta fórmula. La marca «Mejor valor» corresponde al máximo entre las filas visibles, no necesariamente al modelo con mayor índice absoluto. Si falta el costo o es cero, la relación aparece como no disponible. Esta comparación no garantiza que el modelo sea el mejor para una tarea concreta.

## Limitaciones

- El dashboard de Cheaper Inference requiere iniciar sesión. La aplicación utiliza su catálogo público, no tarifas personalizadas de una cuenta. Los precios del catálogo están redondeados; el descuento mostrado es el publicado por la plataforma.
- La estimación aplica el descuento uniformemente al costo de AA, incluidos componentes de caché. No constituye una cotización de Cheaper Inference ni incorpora posibles cargos adicionales por búsqueda web, herramientas u otras condiciones.
- `web-search` indica una capacidad publicada en el catálogo, pero puede requerir activar herramientas. La presencia de un nivel de esfuerzo en AA no garantiza que ese nivel esté disponible en la API de Cheaper Inference.
- Las fuentes se extraen de datos públicos utilizados por sus páginas web, no de una API estable documentada para esta aplicación. Cambios en su formato, disponibilidad o condiciones de uso pueden impedir la actualización. Las identidades que no coinciden de forma inequívoca se excluyen.
- Los datos son consultas periódicas, no un flujo en tiempo real; los precios y resultados deben confirmarse en las fuentes antes de tomar decisiones.

## Pruebas

```bash
npm test
```

Las pruebas cubren la extracción, el emparejamiento de modelos, los filtros, las fórmulas de costo y valor, y la compatibilidad de la interfaz con respuestas de un servidor anterior.

## Estructura

- `server.js`: servidor HTTP local, API y caché en memoria.
- `data.js`: consulta de fuentes, extracción, emparejamiento y cálculos.
- `public/`: interfaz, estilos, filtros y exportación CSV.
- `data.test.js`: pruebas con el ejecutor integrado de Node.js.
