import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { App } from './app/app';
import { appProviders } from './app.config';
import { AdminModule } from './features/admin/admin.module';
import { PublicModule } from './features/public.module';
import { SharedModule } from './shared/shared.module';
import { CommonModule, NgTemplateOutlet } from '@angular/common';

@NgModule({
    declarations: [
        App,
    ],
    imports: [
        BrowserModule,
        SharedModule,
        PublicModule,
        AdminModule,
    ],
    providers: appProviders,
    bootstrap: [App],
})
export class AppModule { }
