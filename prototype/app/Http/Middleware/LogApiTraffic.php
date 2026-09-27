<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * [R4] Log API traffic ke dedicated channel untuk audit/forensics.
 *
 * Catat: method, path, status, duration, user_id (jika auth), IP.
 * Skip untuk path /up (health check) dan /status untuk avoid noise.
 */
class LogApiTraffic
{
    public function handle(Request $request, Closure $next): Response
    {
        $start = microtime(true);
        $response = $next($request);
        $duration = round((microtime(true) - $start) * 1000, 2);

        // Skip health check
        $skipPaths = ['/up', '/api/status'];
        if (in_array($request->path(), array_map(fn($p) => ltrim($p, '/'), $skipPaths))) {
            return $response;
        }

        Log::channel('api_traffic')->info('api_request', [
            'method' => $request->method(),
            'path' => '/' . $request->path(),
            'status' => $response->getStatusCode(),
            'duration_ms' => $duration,
            'ip' => $request->ip(),
            'user_id' => optional($request->user())->id,
            'user_agent' => substr((string) $request->userAgent(), 0, 100),
        ]);

        return $response;
    }
}
