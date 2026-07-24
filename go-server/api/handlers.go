package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os/exec"

	"github.com/riad-boussaid/mpv-play-golang/types"
)

func launchPlayer(command string, args []string) {
	cmd := exec.Command(command, args...)

	err := cmd.Run()
	if err != nil {
		log.Printf("command failed: %v", err)
	}
}

func Handler(w http.ResponseWriter, r *http.Request) {
	var obj types.Command

	err := json.NewDecoder(r.Body).Decode(&obj)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	command := "mpv"
	args := append(obj.Options, obj.Url)

	fmt.Printf("* %s\n", obj.Url)
	launchPlayer(command, args)

	w.Write([]byte("Success"))
}
