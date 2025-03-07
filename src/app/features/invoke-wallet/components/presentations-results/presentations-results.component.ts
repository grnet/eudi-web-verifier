import {CommonModule} from '@angular/common';
import {Component, inject, Input, OnInit} from '@angular/core';
import {MatListModule} from '@angular/material/list';
import {SharedModule} from "@shared/shared.module";
import {MatExpansionModule} from "@angular/material/expansion";
import {ConcludedTransaction} from "@core/models/ConcludedTransaction";
import {PresentationDefinition} from "@core/models/presentation/PresentationDefinition";
import {ViewAttestationComponent} from "@features/invoke-wallet/components/view-attestation/view-attestation.component";
import {Errored, PresentedAttestation, Single} from "@core/models/presentation/PresentedAttestation";
import {WalletResponseProcessorService} from "@features/invoke-wallet/services/wallet-response-processor.service";
import {MatCardModule} from "@angular/material/card";
import {MatButtonModule} from "@angular/material/button";
import {MatDialog, MatDialogModule} from "@angular/material/dialog";
import {HttpService} from '@network/http/http.service';
import {HttpHeaders} from '@angular/common/http';
import {LocalStorageService} from '@app/core/services/local-storage.service';
import { TxData } from '@features/presentation-request-preparation/home/home.component';
import {OpenLogsComponent} from "@shared/elements/open-logs/open-logs.component";
import {Observable, of} from "rxjs";
import {map} from "rxjs/operators";

@Component({
  selector: 'vc-presentations-results',
  standalone: true,
  imports: [
    CommonModule,
    MatListModule,
    SharedModule,
    MatExpansionModule,
    MatCardModule,
    MatButtonModule,
    MatDialogModule,
    ViewAttestationComponent
  ],
  providers: [WalletResponseProcessorService],
  templateUrl: './presentations-results.component.html',
  styleUrls: ['./presentations-results.component.scss']
})
export class PresentationsResultsComponent implements OnInit {
  constructor(
    private readonly responseProcessor: WalletResponseProcessorService,
    private readonly httpService: HttpService
  ) {
  }

  @Input() concludedTransaction!: ConcludedTransaction;
  presentationRequest!: PresentationDefinition;
  attestations$: Observable<(Single | Errored)[]> = of([]);
  attestations!: (Single | Errored)[];
  readonly dialog: MatDialog = inject(MatDialog);
  readonly localStorageService: LocalStorageService = inject(LocalStorageService);
  txdata: TxData = {'application_id': '', 'target': ''};

  ngOnInit(): void {
    this.presentationRequest = this.concludedTransaction.presentationDefinition;
    this.attestations$ = this.responseProcessor.mapVpTokenToAttestations(this.concludedTransaction)
        .pipe(
          map((attestations) => {
            return this.flatten(attestations)
          })
        );

    this.postAttestations()
  }

  postAttestations(): void {
    this.txdata = JSON.parse(this.localStorageService.get('txdata') || '');
    this.attestations$.subscribe((attestations) => {
	    this.attestations = attestations
    });
    let data = {
	    "profile": this.attestations,
	    "entity": "ΚΕΠ"
    };
    data = Object.assign(this.txdata, data);
    console.log("Tx data", this.txdata);
    console.log("Attestations", this.attestations);
    console.log("Post attestation data", data);

    const headers = {
	    'Content-Type': 'application/json',
    };
    const requestOptions = {
	    'headers': new HttpHeaders(headers),
    };

    this.httpService.postE(
	    "https://snf-74864.ok-kno.grnetcloud.net/api/eudi_present/", data, requestOptions
    )
    .subscribe(response => console.log(response))
  }

  flatten(sharedAttestations: PresentedAttestation[]): (Single | Errored)[] {
    let singles: (Single | Errored)[] = []
    sharedAttestations.forEach(it => {
      switch (it.kind) {
        case "enveloped":
          return singles.push(...it.attestations)
        case "single":
          return singles.push(it)
        case "error":
          return singles.push(it)
      }
    })
    return singles
  }

  isErrored(it: Single | Errored): it is Errored {
    return it.kind === 'error' as const
  }

  viewContents(attestation: Single) {
    this.dialog.open(ViewAttestationComponent, {
      data: {
        attestation: attestation
      },
      height: '40%',
      width: '60%',
    });
  }

  openLogs() {
    this.dialog.open(OpenLogsComponent, {
      data: {
        transactionId: this.concludedTransaction.transactionId,
        label: 'Show Logs',
        isInspectLogs: false
      },
    });
  }
}
