// CloudFront Function (cloudfront-js-2.0), viewer-request, attached to the default (S3) behaviour of each SPA
// distribution only.
//
// Client-side routes such as /cases/123 or /screening/abc/step/2 have no file extension, so they are served
// the SPA shell (/index.html) and React Router takes over. Real files (/assets/index-3f2a9c.js, /favicon.ico,
// /robots.txt, /.well-known/assetlinks.json) pass through unchanged and 404 when missing.
//
// This is done here instead of distribution-wide custom error responses because those would also rewrite
// 403/404 JSON errors coming from the API (/api/* behaviour) into index.html.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);

  if (lastSegment === '' || lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }

  return request;
}
