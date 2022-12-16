import { BrowserModule } from "@angular/platform-browser";
import { NgModule } from "@angular/core";

import { AppRoutingModule } from "./app-routing.module";
import { AppComponent } from "./app.component";

import { NgxChessgroundModule } from "projects/ngx-chessground/src/public-api";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import { MatLegacyListModule as MatListModule } from "@angular/material/legacy-list";
import { MatLegacyCardModule as MatCardModule } from "@angular/material/legacy-card";

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    AppRoutingModule,
    NgxChessgroundModule,
    BrowserAnimationsModule,
    MatListModule,
    MatCardModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
