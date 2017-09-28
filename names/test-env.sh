
export HERE="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

. $HERE/profile.d/pg.sh || exit 1
. $HERE/profile.d/test.sh || exit 1
