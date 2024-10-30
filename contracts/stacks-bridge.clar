;; bridge-contract
;; A bridge contract to facilitate asset transfers between Stacks and BNB Chain

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-invalid-amount (err u101))
(define-constant err-insufficient-balance (err u102))
(define-constant err-already-processed (err u103))

;; Data Variables
(define-data-var min-transfer-amount uint u100000) ;; in microSTX
(define-data-var bridge-fee uint u1000) ;; 0.1% fee in basis points
(define-data-var paused bool false)

;; Data Maps
(define-map balances principal uint)
(define-map processed-transfers (string-ascii 64) bool)

;; Bridge Request Structure
(define-map bridge-requests
    uint
    {
        sender: principal,
        amount: uint,
        bnb-address: (string-ascii 42),
        status: (string-ascii 20)
    }
)

(define-data-var request-nonce uint u0)

;; Read-only functions
(define-read-only (get-balance (user principal))
    (default-to u0 (map-get? balances user))
)

(define-read-only (get-bridge-request (request-id uint))
    (map-get? bridge-requests request-id)
)

;; Public functions
(define-public (initiate-bridge (amount uint) (bnb-address (string-ascii 42)))
    (let
        (
            (current-balance (get-balance tx-sender))
            (nonce (var-get request-nonce))
            (total-amount (+ amount (var-get bridge-fee)))
        )
        (asserts! (not (var-get paused)) (err u104))
        (asserts! (>= amount (var-get min-transfer-amount)) err-invalid-amount)
        (asserts! (>= current-balance total-amount) err-insufficient-balance)
        
        ;; Create bridge request
        (map-set bridge-requests nonce {
            sender: tx-sender,
            amount: amount,
            bnb-address: bnb-address,
            status: "PENDING"
        })
        
        ;; Update nonce
        (var-set request-nonce (+ nonce u1))
        
        ;; Transfer STX to contract
        (try! (stx-transfer? total-amount tx-sender (as-contract tx-sender)))
        
        (ok nonce)
    )
)

;; Admin functions
(define-public (confirm-bridge (request-id uint) (txid (string-ascii 64)))
    (let
        (
            (request (unwrap! (get-bridge-request request-id) err-invalid-amount))
        )
        (asserts! (is-eq tx-sender contract-owner) err-owner-only)
        (asserts! (not (default-to false (map-get? processed-transfers txid))) err-already-processed)
        
        ;; Mark transfer as processed
        (map-set processed-transfers txid true)
        
        ;; Update request status
        (map-set bridge-requests request-id 
            (merge request { status: "COMPLETED" })
        )
        
        (ok true)
    )
)

(define-public (set-min-transfer-amount (amount uint))
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-owner-only)
        (var-set min-transfer-amount amount)
        (ok true)
    )
)

(define-public (set-bridge-fee (new-fee uint))
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-owner-only)
        (var-set bridge-fee new-fee)
        (ok true)
    )
)

(define-public (toggle-pause)
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-owner-only)
        (var-set paused (not (var-get paused)))
        (ok true)
    )
)

;; Emergency functions
(define-public (withdraw-fees)
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-owner-only)
        (let
            (
                (balance (stx-get-balance (as-contract tx-sender)))
            )
            (try! (as-contract (stx-transfer? balance tx-sender contract-owner)))
            (ok true)
        )
    )
)