package main

import (
	"fmt"
	"net/http"

	"github.com/riad-boussaid/mpv-play-golang/api"
)

func main() {
	router := http.NewServeMux()
	router.HandleFunc("POST /", api.Handler)

	server := http.Server{
		Addr:    ":8080",
		Handler: router,
	}

	fmt.Printf("Starting server on port 8080\n")
	server.ListenAndServe()
}
