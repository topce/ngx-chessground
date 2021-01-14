import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

import { NgxChessgroundModule } from 'projects/ngx-chessground/src/public-api';

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, AppRoutingModule, NgxChessgroundModule],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
