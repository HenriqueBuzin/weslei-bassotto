<?php

declare(strict_types=1);

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ConsultancyAdminController;
use App\Http\Controllers\ConsultancyController;
use App\Http\Controllers\MeController;
use App\Http\Controllers\PasswordController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\PlanController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function (): void {
    Route::post('login', [AuthController::class, 'login']);
    Route::post('refresh', [AuthController::class, 'refresh']);
    Route::post('logout', [AuthController::class, 'logout']);
    Route::post('register', [AuthController::class, 'register']);
    Route::post('forgot-password', [PasswordController::class, 'forgot']);
    Route::post('reset-password', [PasswordController::class, 'reset']);
});

Route::get('plans', [PlanController::class, 'index']);

Route::get('consultancy/questions', [ConsultancyController::class, 'questions']);

Route::post('payments/webhooks/{gateway}', [PaymentController::class, 'webhook']);
Route::get('payments/{payment}/status', [PaymentController::class, 'status']);

Route::middleware('jwt')->group(function (): void {
    Route::get('me', [MeController::class, 'show']);
    Route::post('auth/change-password', [AuthController::class, 'changePassword']);

    Route::prefix('consultancy')->group(function (): void {
        Route::post('submissions', [ConsultancyController::class, 'store']);
        Route::get('me/submissions', [ConsultancyController::class, 'mySubmissions']);
        Route::patch('me/submissions/{submission}/answers', [ConsultancyController::class, 'updateAnswers']);
    });

    Route::prefix('payments')->group(function (): void {
        Route::post('card-subscription', [PaymentController::class, 'cardSubscription']);
        Route::post('me/renewals/{submission}', [PaymentController::class, 'renewal']);
    });

    Route::middleware('role:admin')->group(function (): void {
        Route::get('admin/secret', [AdminController::class, 'secret']);

        Route::prefix('consultancy/admin')->group(function (): void {
            Route::get('questions', [ConsultancyAdminController::class, 'questions']);
            Route::post('questions', [ConsultancyAdminController::class, 'storeQuestion']);
            Route::patch('questions/{question}', [ConsultancyAdminController::class, 'updateQuestion']);
            Route::delete('questions/{question}', [ConsultancyAdminController::class, 'destroyQuestion']);

            Route::get('submissions', [ConsultancyAdminController::class, 'submissions']);
            Route::patch('submissions/{submission}', [ConsultancyAdminController::class, 'updateSubmission']);
            Route::post('submissions/{submission}/answers/seen', [ConsultancyAdminController::class, 'markAnswersSeen']);

            Route::get('events', [ConsultancyAdminController::class, 'events']);
            Route::post('events/{event}/seen', [ConsultancyAdminController::class, 'markEventSeen']);
        });
    });
});
